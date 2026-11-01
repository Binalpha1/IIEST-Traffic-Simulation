
/* ==========================================
   IIEST SHIBPUR TRAFFIC SIMULATION
   JavaScript
========================================== */

"use strict";

// ---------- 1. Configuration ----------

const TOTAL_PARKING_SLOTS = 6;
const SIMULATION_TICK_MS = 1000;
const SIGNAL_INTERVAL_MS = 5000;

const $ = (id) => document.getElementById(id);

const elements = {
    insideCount: $("insideCount"),
    outsideCount: $("outsideCount"),
    waitingCount: $("waitingCount"),
    parkingCount: $("parkingCount"),

    startBtn: $("startBtn"),
    pauseBtn: $("pauseBtn"),
    resetBtn: $("resetBtn"),
    addCarBtn: $("addCarBtn"),
    addBusBtn: $("addBusBtn"),
    addPedestrianBtn: $("addPedestrianBtn"),

    statusLight: $("statusLight"),
    trafficStatus: $("trafficStatus"),
    totalCars: $("totalCars"),
    totalBuses: $("totalBuses"),
    totalPedestrians: $("totalPedestrians"),
    occupiedSlots: $("occupiedSlots"),
    activityList: $("activityList"),

    reportToggleBtn: $("reportToggleBtn"),
    secureReport: $("secureReport"),
    exportReportBtn: $("exportReportBtn"),

    totalVehiclesToday: $("totalVehiclesToday"),
    reportWaiting: $("reportWaiting"),
    enteredToday: $("enteredToday"),
    parkedNow: $("parkedNow"),
    exitedToday: $("exitedToday"),
    averageWaitingTime: $("averageWaitingTime"),
    freeParkingSlots: $("freeParkingSlots"),
    numberPlateCount: $("numberPlateCount"),
    numberPlateTable: $("numberPlateTable"),

    signalLight: $("signalLight"),
    signalText: $("signalText")
};

// ---------- 2. Simulation State ----------

let vehicles = [];
let pedestrians = [];

let simulationRunning = false;
let simulationTimer = null;
let signalTimer = null;

let nextVehicleId = 1;
let nextPedestrianId = 1;
let signalState = "RED";

const today = new Date().toLocaleDateString("en-CA");

let dailyReport = loadDailyReport();

function loadDailyReport() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("iiestTrafficDailyReport")
        );

        if (saved && saved.date === today) {
            return saved;
        }
    } catch (error) {
        console.warn("Could not load previous report.", error);
    }

    return {
        date: today,
        totalVehicles: 0,
        entered: 0,
        exited: 0,
        waitingTimeTotal: 0,
        waitingTimeSamples: 0,
        plates: []
    };
}

function saveDailyReport() {
    try {
        localStorage.setItem(
            "iiestTrafficDailyReport",
            JSON.stringify(dailyReport)
        );
    } catch (error) {
        console.warn("Could not save report.", error);
    }
}

// ---------- 3. Utility Functions ----------

function setText(element, value) {
    if (element) {
        element.textContent = String(value);
    }
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function generateNumberPlate() {
    const states = ["WB", "DL", "MH", "UP"];

    const state = randomItem(states);
    const district = String(
        Math.floor(Math.random() * 90) + 10
    );

    const letters = String.fromCharCode(
        65 + Math.floor(Math.random() * 26),
        65 + Math.floor(Math.random() * 26)
    );

    const number = String(
        Math.floor(Math.random() * 9000) + 1000
    );

    return `${state}-${district}-${letters}-${number}`;
}

function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

function getVehiclesInside() {
    return vehicles.filter(
        vehicle => vehicle.status === "inside"
    );
}

function getWaitingVehicles() {
    return vehicles.filter(
        vehicle => vehicle.status === "waiting"
    );
}

function getParkedVehicles() {
    return vehicles.filter(
        vehicle => vehicle.status === "parked"
    );
}

function getFreeSlots() {
    return TOTAL_PARKING_SLOTS - getParkedVehicles().length;
}

function getOccupiedSlots() {
    return getParkedVehicles().length;
}

// ---------- 4. Activity Log ----------

function logActivity(message) {
    if (!elements.activityList) return;

    const item = document.createElement("li");
    item.textContent = `[${getCurrentTime()}] ${message}`;

    elements.activityList.prepend(item);

    // Keep the latest 30 events
    while (elements.activityList.children.length > 30) {
        elements.activityList.lastElementChild.remove();
    }
}

// ---------- 5. Create Vehicle ----------

function createVehicle(type) {
    const plate = generateNumberPlate();

    const vehicle = {
        id: nextVehicleId++,
        type,
        plate,
        status: "waiting",
        createdAt: Date.now(),
        enteredAt: null,
        parkedAt: null,
        exitedAt: null,
        waitSeconds: 0,
        slot: null,
        element: null,
        x: 5,
        y: 46
    };

    vehicles.push(vehicle);

    dailyReport.totalVehicles++;
    dailyReport.plates.push({
        plate,
        type,
        status: "Waiting",
        time: getCurrentTime()
    });

    const vehicleElement = document.createElement("div");

    vehicleElement.className =
        type === "Bus" ? "bus" : "car";

    vehicleElement.classList.add("vehicle");

    vehicleElement.textContent =
        type === "Bus" ? "BUS" : "CAR";

    vehicleElement.title = plate;
    vehicleElement.setAttribute(
        "aria-label",
        `${type}, number plate ${plate}`
    );

    vehicle.element = vehicleElement;

    const simulationArea = $("simulationArea");

    if (simulationArea) {
        simulationArea.appendChild(vehicleElement);
        positionVehicle(vehicle);
    }

    logActivity(
        `${type} arrived at the gate. Plate: ${plate}`
    );

    updateDashboard();
    saveDailyReport();

    return vehicle;
}

// ---------- 6. Position Vehicle ----------

function positionVehicle(vehicle) {
    if (!vehicle.element) return;

    vehicle.element.style.left = `${vehicle.x}%`;
    vehicle.element.style.top = `${vehicle.y}%`;
}

function moveVehicle(vehicle, x, y) {
    vehicle.x = x;
    vehicle.y = y;
    positionVehicle(vehicle);
}

// ---------- 7. Admit Waiting Vehicles ----------

function admitWaitingVehicle() {
    const waiting = getWaitingVehicles();

    if (waiting.length === 0) return;

    if (signalState !== "GREEN") return;

    const vehicle = waiting[0];

    vehicle.status = "inside";
    vehicle.enteredAt = Date.now();

    const waitedSeconds = Math.max(
        0,
        Math.round(
            (vehicle.enteredAt - vehicle.createdAt) / 1000
        )
    );

    vehicle.waitSeconds = waitedSeconds;

    dailyReport.entered++;
    dailyReport.waitingTimeTotal += waitedSeconds;
    dailyReport.waitingTimeSamples++;

    const record = dailyReport.plates.find(
        plate => plate.plate === vehicle.plate
    );

    if (record) {
        record.status = "Entered";
        record.time = getCurrentTime();
    }

    moveVehicle(vehicle, 44, 46);

    logActivity(
        `${vehicle.type} entered campus. Plate: ${vehicle.plate}`
    );

    saveDailyReport();
    updateDashboard();
}

// ---------- 8. Parking ----------

function parkVehicle(vehicle) {
    if (!vehicle || vehicle.status !== "inside") return;

    if (getFreeSlots() <= 0) {
        logActivity(
            `Parking full. ${vehicle.plate} could not park.`
        );
        return;
    }

    const occupied = new Set(
        getParkedVehicles().map(v => v.slot)
    );

    let slotNumber = 1;

    while (occupied.has(slotNumber)) {
        slotNumber++;
    }

    vehicle.status = "parked";
    vehicle.slot = slotNumber;
    vehicle.parkedAt = Date.now();

    if (vehicle.element) {
        vehicle.element.style.display = "none";
    }

    const slotElement = $(`slot${slotNumber}`);

    if (slotElement) {
        slotElement.classList.add("occupied");
        slotElement.textContent = vehicle.plate;
        slotElement.title = `${vehicle.type}: ${vehicle.plate}`;
    }

    const record = dailyReport.plates.find(
        plate => plate.plate === vehicle.plate
    );

    if (record) {
        record.status = "Parked";
        record.time = getCurrentTime();
    }

    logActivity(
        `${vehicle.plate} parked in slot ${slotNumber}.`
    );

    saveDailyReport();
    updateDashboard();
}

// ---------- 9. Exit Vehicle ----------

function exitVehicle(vehicle) {
    if (!vehicle) return;

    if (
        vehicle.status !== "inside" &&
        vehicle.status !== "parked"
    ) {
        return;
    }

    const previousStatus = vehicle.status;

    if (previousStatus === "parked" && vehicle.slot) {
        const slotElement = $(`slot${vehicle.slot}`);

        if (slotElement) {
            slotElement.classList.remove("occupied");
            slotElement.textContent = `Slot ${vehicle.slot}`;
            slotElement.title = "";
        }
    }

    vehicle.status = "exited";
    vehicle.exitedAt = Date.now();

    dailyReport.exited++;

    const record = dailyReport.plates.find(
        plate => plate.plate === vehicle.plate
    );

    if (record) {
        record.status = "Exited";
        record.time = getCurrentTime();
    }

    if (vehicle.element) {
        vehicle.element.remove();
    }

    logActivity(
        `${vehicle.plate} exited campus.`
    );

    saveDailyReport();
    updateDashboard();
}

// ---------- 10. Pedestrians ----------

function addPedestrian() {
    const pedestrian = {
        id: nextPedestrianId++,
        element: null,
        x: 10 + Math.random() * 20,
        y: 70 + Math.random() * 10
    };

    const element = document.createElement("div");

    element.className = "pedestrian";
    element.textContent = "P";
    element.title = "Pedestrian";

    pedestrian.element = element;
    pedestrians.push(pedestrian);

    const simulationArea = $("simulationArea");

    if (simulationArea) {
        simulationArea.appendChild(element);
        element.style.left = `${pedestrian.x}%`;
        element.style.top = `${pedestrian.y}%`;
    }

    logActivity("Pedestrian added to the simulation.");
    updateDashboard();
}

// ---------- 11. Update Simulation ----------

function simulationTick() {
    if (!simulationRunning) return;

    // Move vehicles waiting at the gate
    const waiting = getWaitingVehicles();

    waiting.forEach((vehicle, index) => {
        const x = Math.max(3, 24 - index * 5);

        moveVehicle(
            vehicle,
            x,
            vehicle.type === "Bus" ? 45 : 47
        );
    });

    // Move vehicles that have entered
    const inside = getVehiclesInside();

    inside.forEach(vehicle => {
        if (!vehicle.enteredAt) return;

        const elapsed =
            (Date.now() - vehicle.enteredAt) / 1000;

        if (elapsed >= 3 && vehicle.status === "inside") {
            if (getFreeSlots() > 0) {
                parkVehicle(vehicle);
            }
        }
    });

    updateDashboard();
}

// ---------- 12. Traffic Signal ----------

function updateSignal() {
    if (signalState === "RED") {
        signalState = "GREEN";
    } else if (signalState === "GREEN") {
        signalState = "YELLOW";
    } else {
        signalState = "RED";
    }

    updateSignalDisplay();

    if (signalState === "GREEN") {
        admitWaitingVehicle();
    }
}

function updateSignalDisplay() {
    if (elements.signalText) {
        elements.signalText.textContent =
            `Signal: ${signalState}`;
    }

    const signal = elements.signalLight;

    if (signal) {
        signal.dataset.state = signalState.toLowerCase();

        signal.querySelectorAll(".red, .yellow, .green")
            .forEach(light => light.classList.remove("active"));

        const activeLight = signal.querySelector(
            `.${signalState.toLowerCase()}`
        );

        if (activeLight) {
            activeLight.classList.add("active");
        }
    }

    if (elements.statusLight) {
        elements.statusLight.style.background =
            signalState === "GREEN"
                ? "#22c55e"
                : signalState === "YELLOW"
                    ? "#facc15"
                    : "#ef4444";
    }

    if (elements.trafficStatus) {
        elements.trafficStatus.textContent = signalState;
    }
}

// ---------- BACKEND CONNECTION ----------

const API_URL = "http://localhost:3000/api/traffic";

let lastSentTrafficData = "";

async function syncTrafficData() {
    const averageWaiting =
        dailyReport.waitingTimeSamples > 0
            ? Math.round(
                dailyReport.waitingTimeTotal /
                dailyReport.waitingTimeSamples
            )
            : 0;

    const data = {
        totalVehicles: dailyReport.totalVehicles,
        waitingVehicles: getWaitingVehicles().length,
        averageWaitingTime: averageWaiting,
        insideVehicles: getVehiclesInside().length,
        parkedVehicles: getParkedVehicles().length,
        exitedVehicles: dailyReport.exited,
        totalCars: vehicles.filter(v => v.type === "Car").length,
        totalBuses: vehicles.filter(v => v.type === "Bus").length,
        totalPedestrians: pedestrians.length,
        freeParkingSlots: getFreeSlots(),
        signalState: signalState
    };

    const dataString = JSON.stringify(data);

    // Send only when data changes
    if (dataString === lastSentTrafficData) return;

    lastSentTrafficData = dataString;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: dataString
        });

        if (!response.ok) {
            throw new Error("Backend request failed");
        }

        console.log("Backend synchronized:", data);

    } catch (error) {
        lastSentTrafficData = "";
        console.error("Backend connection error:", error);
    }
}

// ---------- 13. Dashboard ----------

function updateDashboard() {
    const inside = getVehiclesInside().length;
    const waiting = getWaitingVehicles().length;
    const parked = getParkedVehicles().length;
    const exited = vehicles.filter(
        vehicle => vehicle.status === "exited"
    ).length;

    setText(elements.insideCount, inside);
    setText(elements.outsideCount, waiting);
    setText(elements.waitingCount, waiting);
    setText(elements.parkingCount, parked);

    setText(
        elements.totalCars,
        vehicles.filter(v => v.type === "Car").length
    );

    setText(
        elements.totalBuses,
        vehicles.filter(v => v.type === "Bus").length
    );

    setText(elements.totalPedestrians, pedestrians.length);
    setText(elements.occupiedSlots, parked);

    updateReport();

    // Keep variables referenced for debugging if needed
    syncTrafficData();
    void exited;
}

// ---------- 14. Report ----------

function updateReport() {
    const waiting = getWaitingVehicles().length;
    const parked = getParkedVehicles().length;

    const averageWaiting =
        dailyReport.waitingTimeSamples > 0
            ? Math.round(
                dailyReport.waitingTimeTotal /
                dailyReport.waitingTimeSamples
            )
            : 0;

    setText(
        elements.totalVehiclesToday,
        dailyReport.totalVehicles
    );

    setText(elements.reportWaiting, waiting);
    setText(elements.enteredToday, dailyReport.entered);
    setText(elements.parkedNow, parked);
    setText(elements.exitedToday, dailyReport.exited);

    setText(
        elements.averageWaitingTime,
        `${averageWaiting} sec`
    );

    setText(elements.freeParkingSlots, getFreeSlots());
    setText(
        elements.numberPlateCount,
        dailyReport.plates.length
    );

    renderNumberPlateTable();
}

function renderNumberPlateTable() {
    if (!elements.numberPlateTable) return;

    elements.numberPlateTable.replaceChildren();

    if (dailyReport.plates.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.textContent = "No vehicle records yet.";

        row.appendChild(cell);
        elements.numberPlateTable.appendChild(row);

        return;
    }

    dailyReport.plates.forEach((record, index) => {
        const row = document.createElement("tr");

        const values = [
            index + 1,
            record.plate,
            record.type,
            record.status
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = String(value);
            row.appendChild(cell);
        });

        elements.numberPlateTable.appendChild(row);
    });
}

// ---------- 15. Show / Hide Report ----------

function toggleReport() {
    if (!elements.secureReport || !elements.reportToggleBtn) {
        console.error("Report section or button is missing.");
        return;
    }

    const currentlyHidden = elements.secureReport.hidden;

    elements.secureReport.hidden = !currentlyHidden;

    elements.reportToggleBtn.textContent =
        currentlyHidden
            ? "Hide Secure Report"
            : "View Secure Report";

    elements.reportToggleBtn.setAttribute(
        "aria-expanded",
        String(currentlyHidden)
    );

    if (currentlyHidden) {
        updateReport();
        elements.secureReport.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

// ---------- 16. Export Report as JSON ----------

function exportReport() {
    const averageWaiting =
        dailyReport.waitingTimeSamples > 0
            ? Math.round(
                dailyReport.waitingTimeTotal /
                dailyReport.waitingTimeSamples
            )
            : 0;

    const report = {
        date: dailyReport.date,
        totalVehiclesToday: dailyReport.totalVehicles,
        waitingVehicles: getWaitingVehicles().length,
        enteredVehiclesToday: dailyReport.entered,
        parkedVehiclesNow: getParkedVehicles().length,
        exitedVehiclesToday: dailyReport.exited,
        averageWaitingTimeSeconds: averageWaiting,
        freeParkingSlots: getFreeSlots(),
        numberPlateCount: dailyReport.plates.length,
        numberPlates: dailyReport.plates
    };

    const file = new Blob(
        [JSON.stringify(report, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = `iiest-traffic-report-${today}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    logActivity("Report exported as a JSON file.");
}

// ---------- 17. Start Simulation ----------

function startSimulation() {
    if (simulationRunning) return;

    simulationRunning = true;

    if (simulationTimer) clearInterval(simulationTimer);
    if (signalTimer) clearInterval(signalTimer);

    simulationTimer = setInterval(
        simulationTick,
        SIMULATION_TICK_MS
    );

    signalTimer = setInterval(
        updateSignal,
        SIGNAL_INTERVAL_MS
    );

    updateSignalDisplay();

    logActivity("Simulation started.");

    if (elements.startBtn) {
        elements.startBtn.disabled = true;
    }

    if (elements.pauseBtn) {
        elements.pauseBtn.disabled = false;
    }
}

// ---------- 18. Pause Simulation ----------

function pauseSimulation() {
    simulationRunning = false;

    if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
    }

    if (signalTimer) {
        clearInterval(signalTimer);
        signalTimer = null;
    }

    logActivity("Simulation paused.");

    if (elements.startBtn) {
        elements.startBtn.disabled = false;
    }
}

// ---------- 19. Reset Simulation ----------

function resetSimulation() {
    pauseSimulation();

    vehicles.forEach(vehicle => {
        if (vehicle.element) vehicle.element.remove();
    });

    pedestrians.forEach(pedestrian => {
        if (pedestrian.element) pedestrian.element.remove();
    });

    vehicles = [];
    pedestrians = [];

    nextVehicleId = 1;
    nextPedestrianId = 1;
    signalState = "RED";

    for (let i = 1; i <= TOTAL_PARKING_SLOTS; i++) {
        const slot = $(`slot${i}`);

        if (slot) {
            slot.classList.remove("occupied");
            slot.textContent = `Slot ${i}`;
            slot.title = "";
        }
    }

    if (elements.activityList) {
        elements.activityList.replaceChildren();
    }

    if (elements.secureReport) {
        elements.secureReport.hidden = true;
    }

    if (elements.reportToggleBtn) {
        elements.reportToggleBtn.textContent =
            "View Secure Report";

        elements.reportToggleBtn.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    updateSignalDisplay();
    updateDashboard();

    logActivity("Simulation reset. Daily report history preserved.");

    if (elements.startBtn) {
        elements.startBtn.disabled = false;
    }

    if (elements.pauseBtn) {
        elements.pauseBtn.disabled = false;
    }
}

// ---------- 20. Button Event Listeners ----------

if (elements.startBtn) {
    elements.startBtn.addEventListener(
        "click",
        startSimulation
    );
}

if (elements.pauseBtn) {
    elements.pauseBtn.addEventListener(
        "click",
        pauseSimulation
    );
}

if (elements.resetBtn) {
    elements.resetBtn.addEventListener(
        "click",
        resetSimulation
    );
}

if (elements.addCarBtn) {
    elements.addCarBtn.addEventListener(
        "click",
        () => createVehicle("Car")
    );
}

if (elements.addBusBtn) {
    elements.addBusBtn.addEventListener(
        "click",
        () => createVehicle("Bus")
    );
}

if (elements.addPedestrianBtn) {
    elements.addPedestrianBtn.addEventListener(
        "click",
        addPedestrian
    );
}

if (elements.reportToggleBtn) {
    elements.reportToggleBtn.addEventListener(
        "click",
        toggleReport
    );
}

if (elements.exportReportBtn) {
    elements.exportReportBtn.addEventListener(
        "click",
        exportReport
    );
}

// ---------- 21. Initial Setup ----------

updateSignalDisplay();
updateDashboard();

if (elements.pauseBtn) {
    elements.pauseBtn.disabled = true;
}

logActivity("Traffic simulation initialized.");

const menuToggleBtn = document.getElementById("menuToggleBtn");
const controlPanel = document.getElementById("controlPanel");
const closeMenuBtn = document.getElementById("closeMenuBtn");

function openDashboard() {
    controlPanel.hidden = false;
    menuToggleBtn.setAttribute("aria-expanded", "true");
    menuToggleBtn.textContent = "☰ Close Dashboard";
}

function closeDashboard() {
    controlPanel.hidden = true;
    menuToggleBtn.setAttribute("aria-expanded", "false");
    menuToggleBtn.textContent = "☰ Open Dashboard";
}

menuToggleBtn.addEventListener("click", () => {
    if (controlPanel.hidden) {
        openDashboard();
    } else {
        closeDashboard();
    }
});

closeMenuBtn.addEventListener("click", closeDashboard);



