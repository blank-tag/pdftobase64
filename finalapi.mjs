import express from "express";
import pdf2img from "pdf-img-convert";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";
import PDFDocument from 'pdfkit';
import dotenv from "dotenv";
import path from 'path';
import AWS from 'aws-sdk';
import bodyParser from 'body-parser';
import stream from 'stream';

dotenv.config(); // Load environment variables from the .env file

const app = express();
app.use(bodyParser.json({ limit: '50mb' })); // Increase the payload size limit

app.use(cors());


AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});


const s3 = new AWS.S3();

app.post('/api/generate-pdf', async (req, res) => {
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
  
    // Calculate the width and height of the image
    const imageWidth = 200; // Adjust the width as desired
    const imageHeight = 500; // Adjust the height as desired
  
    // Calculate the available height for the image
    const availableHeight = doc.page.height - table.currentY - table.padding;
  
    // Check if the image fits on the current page, otherwise start a new page
    if (availableHeight < imageHeight) {
      doc.addPage();
      table.tablesOnCurrentPage = 0;
      table.currentY = 0;
    }
  
    // Draw the image
    doc.image(imageBuffer, {
      fit: [imageWidth, imageHeight],
      align: 'center',
      valign: 'center',
    });
  
    // Update the current Y position for drawing images
    table.currentY += imageHeight + table.padding;
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


  const bufferStream = new stream.PassThrough();
  doc.pipe(bufferStream);
  doc.end();

  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    bufferStream.on('data', (chunk) => chunks.push(chunk));
    bufferStream.on('end', () => resolve(Buffer.concat(chunks)));
    bufferStream.on('error', reject);
  });

  const randomKey = crypto.randomBytes(8).toString('hex');
  const pdfKey = `${randomKey}.pdf`;


    // Upload PDF to S3 bucket
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: process.env.AWS_BUCKET_FOLDER + pdfKey, // Specify the desired filename in the bucket
      Body: buffer,
    };

    s3.upload(uploadParams, (err, data) => {
      if (err) {
        console.error('Error uploading PDF:', err);
        return res.status(500).json({ error: 'Failed to upload PDF' });
      }

      console.log('PDF uploaded successfully:', data.Location);


  // Set the response headers for the PDF file
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=output.pdf');
  res.send(buffer);
});
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
