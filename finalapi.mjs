import express from "express";
import pdf2img from "pdf-img-convert";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(express.json());

app.use(cors());

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

      const response = await fetch("http://13.232.187.12:5000/ocr/resources", {
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
