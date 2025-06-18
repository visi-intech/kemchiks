const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const cors = require("cors");
const path = require("path");
const puppeteer = require("puppeteer");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const webServer = http.createServer(app);
const wss = new WebSocket.Server({ server: webServer });

const PORT_WEB = 3001;
const PORT_WS = 8765;

const receiptFolder = "C:\\kasir_print";
const receiptHtmlPath = path.join(receiptFolder, "receipt.html");
const receiptPdfPath = path.join(receiptFolder, "receipt.pdf");
const sumatraPath = `\"C:\\Users\\abhif\\AppData\\Local\\SumatraPDF\\SumatraPDF.exe\"`;
const printerName = "Star BSC10";
const printerShareName = "\\\\localhost\\Star BSC10";
const drawerCommand = Buffer.from([27, 112, 0, 25, 250]);
const clientHtmlPath = path.join(__dirname, "client.html");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Pastikan folder tersedia
if (!fs.existsSync(receiptFolder)) {
    fs.mkdirSync(receiptFolder);
    console.log("📁 Folder dibuat:", receiptFolder);
}

// Endpoint test
app.get("/test", (req, res) => {
    res.send("🧪 Server printer aktif dan siap menerima print.");
});

// Endpoint cetak
app.post("/print", async (req, res) => {
    let html = req.body.html;
    if (typeof html !== "string") return res.status(400).send("❌ Data html harus berupa string.");

    html = html.replace(/Powered by Odoo/gi, "PT. TOKO MAKMUR SENTOSA");

    const styledHtml = `
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            html, body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            body {
                font-family: "Consolas", "Lucida Console", monospace;
                font-size: 10px;
                font-weight: normal;
                line-height: 1.1;
                width: 72mm;
                padding: 2mm;
                color: black;
                background: white;
            }
            .pos-receipt {
                font-size: 10px;
                line-height: 1.1;
            }
            .pos-receipt-right-align {
                float: right;
            }
            .pos-receipt-amount {
                margin: 0.5mm 0;
            }
            .pos-receipt-center-align {
                text-align: center;
            }
            .pos-receipt-logo {
                max-width: 100%;
                max-height: 25mm;
                display: block;
                margin: 0 auto;
            }
            .pos-receipt-order-data {
                font-size: 9px;
                margin-top: 1mm;
            }
            .paymentlines {
                margin-top: 1mm;
            }
            .receipt-change {
                margin-top: 1mm;
            }
            .customer-note {
                font-style: italic;
            }
            .before-footer, .after-footer {
                margin-top: 1mm;
            }
            #posqrcode {
                width: 30mm;
                display: block;
                margin: 1mm auto;
            }
            hr {
                border-top: 1px dashed black;
                margin: 0.5mm 0;
            }
            li, div, span {
                margin-bottom: 0.5mm;
            }
            ul {
                margin-left: 2mm;
            }
        </style>
    </head>
    <body>${html}</body></html>`;

    try {
        fs.writeFileSync(receiptHtmlPath, styledHtml, "utf-8");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setContent(styledHtml, { waitUntil: "networkidle0" });
        await page.pdf({ path: receiptPdfPath, width: "72mm", printBackground: true });
        await browser.close();

        exec(`${sumatraPath} -print-to \"${printerName}\" -silent \"${receiptPdfPath}\"`);
        console.log("✅ Struk dicetak.");
        res.send("🖨️ Struk berhasil dikirim ke printer.");
    } catch (err) {
        console.error("❌ Error cetak:", err);
        res.status(500).send("Gagal cetak.");
    }
});

// Endpoint buka drawer
app.post("/open-drawer", (req, res) => {
    const filePath = path.join(receiptFolder, "drawer_test.bin");
    try {
        fs.writeFileSync(filePath, drawerCommand);
        exec(`copy /B \"${filePath}\" \"${printerShareName}\"`, (err, stdout, stderr) => {
            if (err) {
                console.error("❌ Gagal COPY drawer:", err.message);
                return res.status(500).send("Gagal membuka drawer");
            }
            console.log("✅ Drawer terbuka");
            res.send("Drawer opened successfully");
        });
    } catch (e) {
        console.error("❌ Error:", e.message);
        res.status(500).send("Internal error");
    }
});

// Serve client HTML
app.get("/", (req, res) => {
    fs.readFile(clientHtmlPath, (err, content) => {
        if (err) return res.status(404).send("Not found");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
    });
});

// WebSocket Broadcast
wss.on("connection", (ws) => {
    console.log("🔌 WebSocket connected");
    ws.on("message", (message) => {
        const lines = message.toString().split("\n");
        const payload = JSON.stringify({ line1: lines[0] || '', line2: lines[1] || '' });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
    });
});

// Start Server
webServer.listen(PORT_WS, () => {
    console.log(`🌐 Web & WebSocket server di http://localhost:${PORT_WS}`);
});

app.listen(PORT_WEB, () => {
    console.log(`🚀 Printer server aktif di http://localhost:${PORT_WEB}`);
});
