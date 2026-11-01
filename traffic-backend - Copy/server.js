
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Latest data received from frontend
let trafficData = {
    totalVehicles: 0,
    waitingVehicles: 0,
    averageWaitingTime: 0,
    insideVehicles: 0,
    parkedVehicles: 0,
    exitedVehicles: 0,
    totalCars: 0,
    totalBuses: 0,
    totalPedestrians: 0,
    freeParkingSlots: 6,
    signalState: "RED"
};

// Main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Dashboard page
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Send latest traffic data
app.get("/api/traffic", (req, res) => {
    res.json(trafficData);
});

// Receive traffic data from frontend
app.post("/api/traffic", (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "No traffic data received" });
    }

    trafficData = {
        ...trafficData,
        ...req.body
    };

    console.log("UPDATED DATA FROM FRONTEND:", trafficData);

    res.json({
        success: true,
        message: "Traffic data updated",
        data: trafficData
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
