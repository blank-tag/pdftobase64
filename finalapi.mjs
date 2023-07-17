import express from "express";
import pdf2img from "pdf-img-convert";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";
import PDFDocument from 'pdfkit';
import dotenv from "dotenv";
import path from 'path';


import bodyParser from 'body-parser';


dotenv.config(); // Load environment variables from the .env file

const app = express();
app.use(express.json());
app.use(bodyParser.json());


app.use(cors());



app.post('/api/generate-pdf', (req, res) => {
  const jsonData = req.body;
  console.log(jsonData);

  if (!jsonData || !Array.isArray(jsonData.content)) {
    return res.status(400).json({ error: 'Invalid JSON data or missing content array' });
  }

  // Create a new PDF document
  const doc = new PDFDocument();

  // Set the font for Japanese text
  const fontPath = path.resolve('NotoSansCJKjp-Regular.ttf');
  doc.font(fontPath);

  // Define table properties
  const table = {
    headerColor: '#333', // Header row color
    rowColor: ['#ccc', '#eee'], // Alternate row colors
    textColor: '#000', // Text color
    fontSize: 12, // Font size
    padding: 10, // Padding
    lineHeight: 2, // Line height
    headerAlign: 'center', // Header alignment
    align: ['center'], // Data cell alignment (center in this example)
    maxTablesPerPage: 3, // Maximum number of tables per page
    tablesOnCurrentPage: 0, // Number of tables on the current page
    currentY: 6, // Current Y position for drawing tables
  };

  // Function to draw a table
  const drawTable = (columns, rows) => {
    let currentRow = 0;

    // Calculate the available height for the table
    const availableHeight = doc.page.height - 2 * table.padding - table.currentY;

    // Calculate the maximum number of rows that can fit on the page
    const maxRowsPerPage = Math.floor(availableHeight / (table.fontSize * table.lineHeight));

    // Check if the table fits on the current page, otherwise start a new page
    if (currentRow + rows.length > maxRowsPerPage || table.tablesOnCurrentPage >= table.maxTablesPerPage) {
      doc.addPage();
      table.tablesOnCurrentPage = 0;
      table.currentY = 0;
      currentRow = 0;
    }

  // Function to draw a row
const drawRow = (rowData, color) => {
  const startY = table.padding + table.currentY + currentRow * (table.fontSize * table.lineHeight);
  const rowHeight = table.fontSize * table.lineHeight;

  // Draw horizontal line at the top of the row
  doc.moveTo(table.padding, startY).lineTo(doc.page.width - table.padding, startY).stroke();

  rowData.forEach((cellData, cellIndex) => {
    const startX = table.padding + cellIndex * (doc.page.width / columns.length);
    const columnWidth = doc.page.width / columns.length;

    doc
      .fillColor(table.textColor)
      .text(cellData, startX, startY, {
        width: columnWidth - table.padding * 2,
        align: table.align[cellIndex],
      });

    // Draw vertical lines between columns
    doc.moveTo(startX, startY).lineTo(startX, startY + rowHeight).stroke();

    // Draw closing vertical line at the end of the table
    if (cellIndex === columns.length - 1) {
      doc.moveTo(startX + columnWidth, startY).lineTo(startX + columnWidth, startY + rowHeight).stroke();
    }
  });

  // Draw horizontal line at the bottom of the row
  doc.moveTo(table.padding, startY + rowHeight).lineTo(doc.page.width - table.padding, startY + rowHeight).stroke();

  currentRow++;
};

    // Draw the header row
    drawRow(columns, table.headerColor);

    // Draw data rows
    rows.forEach((row, index) => {
      if (currentRow >= maxRowsPerPage) {
        doc.addPage();
        table.tablesOnCurrentPage = 0;
        table.currentY = 0;
        currentRow = 0;
        drawRow(columns, table.headerColor); // Redraw the header row on the new page
      }

      const color = table.rowColor[index % table.rowColor.length];
      const rowData = columns.map((col) => row[col]);
      drawRow(rowData, color);
    });

    // Update the current Y position for drawing tables
    table.currentY += currentRow * (table.fontSize * table.lineHeight) + 2 * table.padding;
    table.tablesOnCurrentPage++;
  };

  // Function to write text
  const writeText = (text) => {
    doc
      .fillColor(table.textColor)
      .text(text, table.padding, table.currentY + table.padding, {
        width: doc.page.width - 2 * table.padding,
        align: 'left',
      });

    // Update the current Y position for drawing text
    table.currentY += table.padding + table.fontSize * table.lineHeight + 150;  };

  // Function to draw an image from base64 data
  const drawImage = (base64Data) => {
    const imageData = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(imageData, 'base64');
    doc.image(imageBuffer, {
      fit: [200, 200], // Adjust the width and height as desired
      align: 'center',
      valign: 'center',
    });

    // Update the current Y position for drawing images
    table.currentY += 220 + 300; // Adjust the value based on the image height and desired spacing
  };

  // Function to add the name and value to the PDF
  const addNameAndValue = (name, value) => {
    doc
      .fillColor('#333')
      .fontSize(18)
      .text(name, { align: 'center', underline: true })
      .text(value, { align: 'center' });

    // Update the current Y position for drawing the name and value
    table.currentY += table.padding + table.fontSize * table.lineHeight * 2 + 300;
  };

  // Iterate over the content array
  jsonData.content.forEach((contentItem) => {
    if (contentItem.type === 1) {
      const { value } = contentItem;
      const { columns, rows } = value;
      if (table.tablesOnCurrentPage >= table.maxTablesPerPage) {
        doc.addPage();
        table.tablesOnCurrentPage = 0;
        table.currentY = 0;
      }
      drawTable(columns, rows);
    } else if (contentItem.type === 2) {
      const { value } = contentItem;
      writeText(value);
    } else if (contentItem.type === 3) {
      const { value } = contentItem;
      drawImage(value);
    } else if (contentItem.name && contentItem.value) {
      addNameAndValue(contentItem.name, contentItem.value);
    }
  });

  // Set the response headers for the PDF file
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=output.pdf');

  // Stream the PDF to the response
  doc.pipe(res);
  doc.end();
});

app.post("/convert-pdf", async (req, res) => {
  try {
    const { pdfPath } = req.body;
    const mainjson = [];

    const outputImages = await pdf2img.convert(pdfPath);

    for (let i = 0; i < outputImages.length; i++) {
      const imageData = outputImages[i];
      const base64Data = Buffer.from(imageData).toString("base64");

      const randomString = crypto.randomBytes(8).toString("hex"); // Generate a random string of length 8
      const json = {
        output: i,
        base64Data: `data:image/png;base64,${base64Data}`,
        title: randomString,
      };

      mainjson.push(json);

      const response = await fetch(process.env.API_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: json.base64Data, title: json.title }),
      });

      console.log("Response:", response);
    }

    console.log("-->", mainjson);

    res.json(mainjson);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
