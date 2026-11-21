const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const configuredJwtSecret = process.env.JWT_SECRET;
if (isProduction && (!configuredJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error("Set JWT_SECRET to a random secret of at least 32 characters in production.");
}
const JWT_SECRET = configuredJwtSecret || "hunza-rider-demo-secret";
const locations = [
  "Aliabad",
  "Karimabad",
  "Altit",
  "Ganish",
  "Ganesh",
  "Nagar Khas",
  "Hoper",
  "Gulmit",
  "Passu",
  "Sost",
  "Attabad Lake",
  "Duikar"
];
const rideStages = ["Accepted", "Arriving at Pickup", "Passenger Picked Up", "Ride Started", "Completed"];
const vehicleRates = { Car: 1, SUV: 1.4, Van: 1.65 };

const users = [];
const rides = [];
let nextUserId = 1;
let nextRideId = 1;

function estimateFare(pickup, destination, vehicle) {
  if (!pickup || !destination || pickup === destination) return 0;

  const routeDistance = Math.max(
    4,
    Math.abs(locations.indexOf(pickup) - locations.indexOf(destination)) * 5 + 4
  );

  const fare = Math.round((250 + routeDistance * 75) * (vehicleRates[vehicle] || 1) / 50) * 50;
  return Number(fare);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function serializeRide(ride) {
  if (!ride) return null;

  return {
    ...ride,
    fare: Number(ride.fare) || 0,
    ignoredDriverEmails: Array.isArray(ride.ignoredDriverEmails) ? ride.ignoredDriverEmails : []
  };
}

function serializeRideForUser(ride, user) {
  const result = serializeRide(ride);
  delete result.ignoredDriverEmails;

  if (user.role === "driver" && ride.driverEmail !== user.email) {
    delete result.passengerName;
    delete result.passengerEmail;
    delete result.passengerPhone;
    delete result.driverEmail;
    delete result.driverPhone;
  }

  return result;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = users.find((item) => item.id === payload.id);

    if (!user) {
      return res.status(401).json({ message: "User session not found." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function ensureDriverFields(body) {
  const vehicleType = String(body.vehicleType || "").trim();
  const vehicleModel = String(body.vehicleModel || "").trim();
  const vehicleRegistration = String(body.vehicleRegistration || "").trim();
  const licenseNumber = String(body.licenseNumber || "").trim();

  if (!vehicleType || !vehicleModel || !vehicleRegistration || !licenseNumber) {
    return "Driver details are required for driver accounts.";
  }

  return null;
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Hunza Rider backend" });
});

app.get("/api/locations", (req, res) => {
  res.json({ locations });
});

app.post("/api/auth/signup", async (req, res) => {
  const role = String(req.body.role || "passenger").trim().toLowerCase();
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const password = String(req.body.password || "");

  if (!["passenger", "driver"].includes(role)) {
    return res.status(400).json({ message: "Choose a valid account type." });
  }

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: "Name, email, phone and password are required." });
  }

  if (name.length > 100 || email.length > 254 || phone.length > 30 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter valid name, email and phone details." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters long." });
  }

  if (users.some((user) => user.email.toLowerCase() === email)) {
    return res.status(409).json({ message: "A user with this email already exists." });
  }

  if (role === "driver") {
    const driverError = ensureDriverFields(req.body);
    if (driverError) {
      return res.status(400).json({ message: driverError });
    }
  }

  const user = {
    id: nextUserId++,
    role,
    name,
    email,
    phone,
    verified: true,
    passwordHash: "",
    licenseNumber: String(req.body.licenseNumber || "").trim(),
    vehicleType: String(req.body.vehicleType || "").trim(),
    vehicleRegistration: String(req.body.vehicleRegistration || "").trim(),
    vehicleModel: String(req.body.vehicleModel || "").trim(),
    photoUrl: String(req.body.photoUrl || "").trim(),
    createdAt: new Date().toISOString()
  };

  user.passwordHash = await bcrypt.hash(password, 10);
  users.push(user);

  res.status(201).json({
    user: sanitizeUser(user),
    token: createToken(user)
  });
});

app.post("/api/auth/login", async (req, res) => {
  const role = String(req.body.role || "").trim().toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = users.find((item) => item.email.toLowerCase() === email);

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  if (role && user.role !== role) {
    return res.status(403).json({ message: "This account is not registered as a " + role + "." });
  }

  res.json({
    user: sanitizeUser(user),
    token: createToken(user)
  });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get("/api/dashboard", authMiddleware, (req, res) => {
  const user = req.user;
  const visibleRides = user.role === "driver"
    ? rides.filter((ride) =>
        (ride.status === "Requested" && !ride.ignoredDriverEmails.includes(user.email)) ||
        ride.driverEmail === user.email
      )
    : rides.filter((ride) =>
        ride.passengerEmail === user.email || ride.driverEmail === user.email
      );

  res.json({
    user: sanitizeUser(user),
    rides: visibleRides.map((ride) => serializeRideForUser(ride, user))
  });
});

app.post("/api/rides", authMiddleware, (req, res) => {
  if (req.user.role !== "passenger") {
    return res.status(403).json({ message: "Only passengers can request rides." });
  }

  const pickup = String(req.body.pickup || "").trim();
  const destination = String(req.body.destination || "").trim();
  const vehicle = String(req.body.vehicle || "Car").trim();
  const passengers = Number(req.body.passengers || 1);

  if (!pickup || !destination) {
    return res.status(400).json({ message: "Pickup and destination are required." });
  }

  if (!locations.includes(pickup) || !locations.includes(destination)) {
    return res.status(400).json({ message: "Choose pickup and destination from the available locations." });
  }

  if (pickup === destination) {
    return res.status(400).json({ message: "Pickup and destination cannot be the same." });
  }

  if (!Object.prototype.hasOwnProperty.call(vehicleRates, vehicle)) {
    return res.status(400).json({ message: "Choose a valid vehicle type." });
  }

  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 8) {
    return res.status(400).json({ message: "Passenger count must be between 1 and 8." });
  }

  const ride = {
    id: nextRideId++,
    pickup,
    destination,
    vehicle,
    passengers,
    fare: estimateFare(pickup, destination, vehicle),
    status: "Requested",
    passengerName: req.user.name,
    passengerEmail: req.user.email,
    passengerPhone: req.user.phone || "Phone shared after acceptance",
    driverName: "",
    driverEmail: "",
    driverPhone: "",
    driverVehicle: "",
    ignoredDriverEmails: [],
    rating: null,
    createdAt: new Date().toISOString()
  };

  rides.push(ride);
  res.status(201).json({ ride: serializeRide(ride) });
});

app.post("/api/rides/:id/cancel", authMiddleware, (req, res) => {
  const ride = rides.find((item) => item.id === Number(req.params.id));

  if (!ride) {
    return res.status(404).json({ message: "Ride not found." });
  }

  if (ride.passengerEmail !== req.user.email) {
    return res.status(403).json({ message: "Only the passenger can cancel this ride." });
  }

  if (!["Requested", "Accepted"].includes(ride.status)) {
    return res.status(400).json({ message: "This ride cannot be cancelled in its current state." });
  }

  ride.status = "Cancelled";
  res.json({ ride: serializeRide(ride) });
});

app.post("/api/rides/:id/rate", authMiddleware, (req, res) => {
  const ride = rides.find((item) => item.id === Number(req.params.id));

  if (!ride) {
    return res.status(404).json({ message: "Ride not found." });
  }

  if (ride.passengerEmail !== req.user.email) {
    return res.status(403).json({ message: "Only the passenger can rate this ride." });
  }

  if (ride.status !== "Completed" || !ride.driverEmail) {
    return res.status(409).json({ message: "Only completed rides with an assigned driver can be rated." });
  }

  if (ride.rating !== null) {
    return res.status(409).json({ message: "This ride has already been rated." });
  }

  const rating = Number(req.body.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5." });
  }

  ride.rating = rating;
  ride.status = "Completed";
  res.json({ ride: serializeRide(ride) });
});

app.post("/api/rides/:id/accept", authMiddleware, (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Only drivers can accept rides." });
  }

  if (!req.user.verified) {
    return res.status(403).json({ message: "Your driver account must be verified before accepting rides." });
  }

  if (rides.some((ride) =>
    ride.driverEmail === req.user.email && !["Completed", "Cancelled"].includes(ride.status)
  )) {
    return res.status(409).json({ message: "Complete or cancel your active ride before accepting another." });
  }

  const ride = rides.find((item) => item.id === Number(req.params.id));
  if (!ride) {
    return res.status(404).json({ message: "Ride not found." });
  }

  if (ride.status !== "Requested") {
    return res.status(409).json({ message: "This ride request is no longer available." });
  }

  ride.status = "Accepted";
  ride.driverName = req.user.name;
  ride.driverEmail = req.user.email;
  ride.driverPhone = req.user.phone || "";
  ride.driverVehicle = [req.user.vehicleModel, req.user.vehicleType].filter(Boolean).join(" · ") || "Demo vehicle";

  res.json({ ride: serializeRide(ride) });
});

app.post("/api/rides/:id/reject", authMiddleware, (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Only drivers can reject rides." });
  }

  const ride = rides.find((item) => item.id === Number(req.params.id));
  if (!ride) {
    return res.status(404).json({ message: "Ride not found." });
  }

  if (ride.status !== "Requested") {
    return res.status(409).json({ message: "This ride request can no longer be rejected." });
  }

  ride.ignoredDriverEmails = Array.from(new Set([...(ride.ignoredDriverEmails || []), req.user.email]));
  res.json({ ride: serializeRideForUser(ride, req.user) });
});

app.post("/api/rides/:id/advance", authMiddleware, (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Only drivers can update ride status." });
  }

  const ride = rides.find((item) => item.id === Number(req.params.id));
  if (!ride) {
    return res.status(404).json({ message: "Ride not found." });
  }

  if (ride.driverEmail !== req.user.email) {
    return res.status(403).json({ message: "You cannot update a ride assigned to another driver." });
  }

  const nextIndex = rideStages.indexOf(ride.status) + 1;
  if (nextIndex <= 0 || nextIndex >= rideStages.length) {
    return res.status(409).json({ message: "This ride is already in its final state." });
  }

  ride.status = rideStages[nextIndex];

  res.json({ ride: serializeRide(ride) });
});

const publicFiles = new Set(["/index.html", "/style.css", "/script.js", "/hunza.jpg"]);
const servePublicFile = express.static(path.join(__dirname), {
  dotfiles: "deny",
  index: false
});
app.use((req, res, next) => {
  if (!publicFiles.has(req.path)) {
    return next();
  }

  return servePublicFile(req, res, next);
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Hunza Rider backend running on http://${HOST}:${PORT}`);
});
