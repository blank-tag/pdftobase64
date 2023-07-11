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

  if (!jsonData || !jsonData.columns || !jsonData.rows) {
    return res.status(400).json({ error: 'Invalid JSON data' });
  }

  const { columns, rows } = jsonData;

  // Create a new PDF document
  const doc = new PDFDocument();

  // Set the font for Japanese text
  const fontPath = path.resolve('NotoSansCJKjp-Regular.ttf');
  doc.font(fontPath);

  // Define table properties
  const table = {
    rows: rows.length + 1, // Include the header row
    columns: columns.length,
    headerColor: '#333', // Header row color
    rowColor: ['#ccc', '#eee'], // Alternate row colors
    textColor: '#000', // Text color
    fontSize: 12, // Font size
    padding: 10, // Padding
    lineHeight: 1.2, // Line height
    headerAlign: 'center', // Header alignment
    align: ['center'], // Data cell alignment (center in this example)
  };

  // Function to draw a table
  const drawTable = () => {
    let currentRow = 0;

    // Function to draw a row
    const drawRow = (rowData, color) => {
      const startY = table.padding + currentRow * table.fontSize * table.lineHeight;
      const rowHeight = table.fontSize * table.lineHeight;

      rowData.forEach((cellData, cellIndex) => {
        const startX = table.padding + cellIndex * (doc.page.width / table.columns);
        doc
          .fillColor(table.textColor)
          .text(cellData, startX, startY, {
            width: doc.page.width / table.columns - table.padding * 2,
            align: table.align[cellIndex],
          });

        // Draw vertical lines between columns
        doc.moveTo(startX, startY).lineTo(startX, startY + rowHeight).stroke();
      });

      currentRow++;
    };

    // Draw the header row
    drawRow(columns, table.headerColor);

    // Draw data rows
    rows.forEach((row, index) => {
      const color = table.rowColor[index % table.rowColor.length];
      const rowData = columns.map((col) => row[col]);
      drawRow(rowData, color);
    });

    // Draw horizontal lines between rows
    const totalTableHeight = table.padding + table.rows * table.fontSize * table.lineHeight;
    for (let i = 0; i <= table.rows; i++) {
      const y = table.padding + i * table.fontSize * table.lineHeight;
      doc.moveTo(table.padding, y).lineTo(doc.page.width - table.padding, y).stroke();
    }

    // Draw vertical lines between columns
    const columnWidth = doc.page.width / table.columns;
    for (let i = 0; i < table.columns; i++) {
      const x = table.padding + i * columnWidth;
      doc.moveTo(x, table.padding).lineTo(x, totalTableHeight).stroke();
    }
  };

  // Call the drawTable function to generate the table
  drawTable();

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
