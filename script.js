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
const state = {
    role: "passenger",
    authMode: "login",
    user: null,
    rides: [],
    activeRideId: null,
    driverOnline: false,
    nextRideId: 1
};

const authScreen = document.getElementById("authScreen");
const passengerDashboard = document.getElementById("passengerDashboard");
const driverDashboard = document.getElementById("driverDashboard");
const authMessage = document.getElementById("authMessage");
const toast = document.getElementById("toast");
const sessionTokenKey = "hunza-rider-token";
let sessionToken = localStorage.getItem(sessionTokenKey) || "";

async function apiRequest(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
    }

    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(function() {
        return {};
    });

    if (!response.ok) {
        throw new Error(payload.message || "Request failed.");
    }

    return payload;
}

function saveSession(token) {
    sessionToken = token;
    localStorage.setItem(sessionTokenKey, token);
}

function clearSession() {
    sessionToken = "";
    localStorage.removeItem(sessionTokenKey);
}

async function refreshDashboard() {
    if (!sessionToken || !state.user) return;
    try {
        const response = await apiRequest("/api/dashboard");
        state.rides = Array.isArray(response.rides) ? response.rides : state.rides;
        if (state.user.role === "passenger") {
            renderPassenger();
        } else {
            renderDriver();
        }
    } catch (error) {
        console.warn("Dashboard refresh failed:", error);
    }
}

function populateLocations() {
    ["pickup", "destination"].forEach(function(id) {
        const select = document.getElementById(id);
        locations.forEach(function(location) {
            const option = document.createElement("option");
            option.value = location;
            option.textContent = location;
            select.appendChild(option);
        });
    });
}

function setRole(role) {
    state.role = role;
    document.querySelectorAll("[data-role]").forEach(function(button) {
        const selected = button.dataset.role === role;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    document.getElementById("driverFields").hidden = role !== "driver" || state.authMode !== "signup";
    document.getElementById("signupName").autocomplete = role === "driver" ? "name" : "name";
    document.querySelector("#signupForm .primary-button").innerHTML =
        "Create " + role + " account <span aria-hidden=\"true\">→</span>";
    document.getElementById("licenseNumber").required = role === "driver" && state.authMode === "signup";
    document.getElementById("vehicleType").required = role === "driver" && state.authMode === "signup";
    document.getElementById("vehicleRegistration").required = role === "driver" && state.authMode === "signup";
    document.getElementById("vehicleModel").required = role === "driver" && state.authMode === "signup";
    document.getElementById("driverPhoto").required = false;
}

function setAuthMode(mode) {
    state.authMode = mode;
    const signup = mode === "signup";
    document.getElementById("loginForm").hidden = signup;
    document.getElementById("signupForm").hidden = !signup;
    document.getElementById("loginTab").classList.toggle("active", !signup);
    document.getElementById("signupTab").classList.toggle("active", signup);
    document.getElementById("loginTab").setAttribute("aria-selected", String(!signup));
    document.getElementById("signupTab").setAttribute("aria-selected", String(signup));
    document.getElementById("authHeading").textContent = signup ? "Join the journey." : "Your next ride awaits.";
    document.getElementById("driverFields").hidden = !signup || state.role !== "driver";
    setRole(state.role);
    authMessage.textContent = "";
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(function() {
        toast.classList.remove("show");
    }, 3200);
}

function enterDemoDashboard(user) {
    state.user = user;
    const previousRide = state.rides.filter(function(ride) {
        return ride.passengerEmail === user.email && ride.status !== "Cancelled";
    }).slice(-1)[0];
    state.activeRideId = previousRide ? previousRide.id : null;
    authScreen.hidden = true;
    passengerDashboard.hidden = user.role !== "passenger";
    driverDashboard.hidden = user.role !== "driver";
    document.getElementById("logoutButton").hidden = false;

    if (user.role === "passenger") {
        document.getElementById("passengerName").textContent = user.name.split(" ")[0];
        renderPassenger();
    } else {
        document.getElementById("driverName").textContent = user.name.split(" ")[0];
        document.getElementById("driverProfileName").textContent = user.name;
        document.getElementById("driverVehicleSummary").textContent =
            [user.vehicleModel, user.vehicleType, user.vehicleRegistration].filter(Boolean).join(" · ") || "Demo vehicle · details not connected";
        document.getElementById("driverAvatar").textContent = user.name.charAt(0).toUpperCase();
        if (user.photoUrl) {
            document.getElementById("driverAvatar").innerHTML = "<img alt=\"Driver profile\" src=\"" + user.photoUrl + "\">";
        }
        document.getElementById("verificationStatus").textContent = user.verified ? "Verified" : "Pending review · demo";
        renderDriver();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function getActiveRide() {
    return state.rides.find(function(ride) {
        return ride.id === state.activeRideId && ride.status !== "Cancelled";
    }) || null;
}

function estimateFare() {
    const pickup = document.getElementById("pickup").value;
    const destination = document.getElementById("destination").value;
    const vehicle = document.getElementById("rideVehicle").value;
    if (!pickup || !destination) {
        document.getElementById("estimatedFare").textContent = "—";
        return;
    }
    if (pickup === destination) {
        document.getElementById("estimatedFare").textContent = "Choose another destination";
        return;
    }

    const routeDistance = Math.max(4, Math.abs(locations.indexOf(pickup) - locations.indexOf(destination)) * 5 + 4);
    const fare = Math.round((250 + routeDistance * 75) * vehicleRates[vehicle] / 50) * 50;
    document.getElementById("estimatedFare").textContent = "PKR " + fare.toLocaleString("en-PK");
}

function createRouteMarkup(ride) {
    return '<div class="route-row"><div class="route-markers"><span>●</span><span>│</span><span>●</span></div>' +
        '<div>' + escapeHtml(ride.pickup) + '<br><br>' + escapeHtml(ride.destination) + '</div></div>';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function(character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
}

function renderPassenger() {
    const currentRide = getActiveRide();
    const status = document.getElementById("passengerRideStatus");
    const empty = document.getElementById("passengerRideContent");
    const details = document.getElementById("passengerRideDetails");

    if (!currentRide) {
        status.textContent = "No active ride";
        status.classList.remove("active");
        empty.hidden = false;
        details.hidden = true;
    } else {
        status.textContent = currentRide.status;
        status.classList.add("active");
        empty.hidden = true;
        details.hidden = false;
        const driverMarkup = currentRide.driverName
            ? '<div class="driver-info"><strong>Your driver: ' + escapeHtml(currentRide.driverName) +
              '</strong><br>' + escapeHtml(currentRide.driverVehicle || "Local vehicle") +
              '<br><a href="tel:' + escapeHtml(currentRide.driverPhone || "") + '">' +
              escapeHtml(currentRide.driverPhone || "Phone unavailable in demo") + '</a></div>'
            : '<div class="driver-info">Waiting for an online driver to accept your request.</div>';
        const canCancel = ["Requested", "Accepted"].includes(currentRide.status);
        const canRate = currentRide.status === "Completed" && !currentRide.rating;
        details.innerHTML = '<div class="ride-detail">' + createRouteMarkup(currentRide) +
            '<div class="ride-meta"><span>' + escapeHtml(currentRide.vehicle) + ' · ' + currentRide.passengers + ' passenger(s)</span><strong>PKR ' + currentRide.fare.toLocaleString("en-PK") + '</strong></div>' +
            driverMarkup +
            (canCancel ? '<div class="action-row"><button class="small-button danger" id="cancelRide">Cancel ride</button></div>' : '') +
            (canRate ? '<div class="action-row"><label for="driverRating">Rate your driver</label><select id="driverRating"><option value="">Choose rating</option><option value="5">5 · Excellent</option><option value="4">4 · Good</option><option value="3">3 · Okay</option><option value="2">2 · Poor</option><option value="1">1 · Bad</option></select><button class="small-button primary" id="submitRating">Submit</button></div>' : '') +
            (currentRide.rating ? '<div class="ride-meta"><span>Your driver rating</span><strong>' + currentRide.rating + ' / 5</strong></div>' : '') +
            '</div>';
        const cancel = document.getElementById("cancelRide");
        if (cancel) cancel.addEventListener("click", cancelCurrentRide);
        const submitRating = document.getElementById("submitRating");
        if (submitRating) submitRating.addEventListener("click", rateCurrentRide);
    }

    const history = state.rides.filter(function(ride) {
        return ride.passengerEmail === state.user.email && ride.status === "Completed";
    }).reverse();
    document.getElementById("passengerHistory").innerHTML = history.length
        ? history.map(historyMarkup).join("")
        : '<div class="empty-state"><p>Your completed rides will appear here.</p></div>';
}

function historyMarkup(ride) {
    return '<div class="history-item"><div><div class="history-route">' + escapeHtml(ride.pickup) + ' → ' + escapeHtml(ride.destination) +
        '</div><div class="history-sub">' + escapeHtml(ride.vehicle) + ' · ' + escapeHtml(ride.status) +
        (ride.rating ? ' · Rated ' + ride.rating + '/5' : '') + '</div></div><div class="history-fare">PKR ' +
        ride.fare.toLocaleString("en-PK") + '</div></div>';
}

function renderDriver() {
    const activeRide = state.rides.find(function(ride) {
        return ride.driverEmail === state.user.email && ride.status !== "Completed" && ride.status !== "Cancelled";
    }) || null;
    const empty = document.getElementById("driverRideContent");
    const details = document.getElementById("driverRideDetails");

    if (!activeRide) {
        empty.hidden = false;
        details.hidden = true;
        empty.querySelector("p").textContent = state.driverOnline
            ? "New ride requests will appear here."
            : "Go online to see ride requests from passengers.";
    } else {
        empty.hidden = true;
        details.hidden = false;
        const stepIndex = rideStages.indexOf(activeRide.status);
        details.innerHTML = '<div class="ride-detail">' + createRouteMarkup(activeRide) +
            '<div class="ride-meta"><span>Passenger · ' + escapeHtml(activeRide.passengers) + '</span><strong>PKR ' + activeRide.fare.toLocaleString("en-PK") + '</strong></div>' +
            '<div class="driver-info"><strong>' + escapeHtml(activeRide.passengerName) + '</strong><br>' +
            escapeHtml(activeRide.passengerPhone) + '<br>' + escapeHtml(activeRide.vehicle) + ' · ' + escapeHtml(activeRide.passengers) + ' passenger(s)</div>' +
            '<div class="ride-step">Ride status: ' + escapeHtml(activeRide.status) + '</div>' +
            (stepIndex < rideStages.length - 1 ? '<button class="small-button primary" id="advanceRide">Update to ' + escapeHtml(rideStages[stepIndex + 1]) + '</button>' : '') +
            '</div>';
        const advance = document.getElementById("advanceRide");
        if (advance) advance.addEventListener("click", advanceRideStatus);
    }

    const available = state.driverOnline
        ? state.rides.filter(function(ride) {
            return ride.status === "Requested" &&
                ride.passengerEmail !== state.user.email &&
                !ride.ignoredDriverEmails.includes(state.user.email);
        })
        : [];
    document.getElementById("requestCount").textContent = available.length + (available.length === 1 ? " request" : " requests");
    document.getElementById("availableRequests").innerHTML = available.length
        ? available.map(function(ride) {
            return '<article class="request-card"><div class="request-card-top"><strong>Ride request · ' + escapeHtml(ride.vehicle) + '</strong><span class="fare">PKR ' + ride.fare.toLocaleString("en-PK") + '</span></div>' +
                createRouteMarkup(ride) +
                '<p class="muted">' + escapeHtml(ride.passengers) + ' passenger(s) · ' + escapeHtml(ride.passengerName || "Passenger") + '</p>' +
                '<div class="action-row"><button class="small-button primary" data-accept="' + ride.id + '">Accept ride</button><button class="small-button" data-reject="' + ride.id + '">Reject</button></div></article>';
        }).join("")
        : '<div class="empty-state"><p>' + (state.driverOnline ? "No new ride requests right now." : "Go online to receive ride requests.") + '</p></div>';

    document.querySelectorAll("[data-accept]").forEach(function(button) {
        button.addEventListener("click", function() { acceptRide(Number(button.dataset.accept)); });
    });
    document.querySelectorAll("[data-reject]").forEach(function(button) {
        button.addEventListener("click", function() { rejectRide(Number(button.dataset.reject)); });
    });

    const completed = state.rides.filter(function(ride) {
        return ride.driverEmail === state.user.email && ride.status === "Completed";
    }).reverse();
    document.getElementById("driverHistory").innerHTML = completed.length
        ? completed.map(historyMarkup).join("")
        : '<div class="empty-state"><p>Your completed rides will appear here.</p></div>';
    const earnings = completed.reduce(function(total, ride) { return total + ride.fare; }, 0);
    document.getElementById("driverEarnings").textContent = "PKR " + earnings.toLocaleString("en-PK");
    document.getElementById("availabilityToggle").setAttribute("aria-pressed", String(state.driverOnline));
    document.getElementById("availabilityLabel").textContent = state.driverOnline ? "Go offline" : "Go online";
}

async function requestRide(event) {
    event.preventDefault();
    const pickup = document.getElementById("pickup").value;
    const destination = document.getElementById("destination").value;
    if (pickup === destination) {
        showToast("Choose a destination different from your pickup.");
        return;
    }

    const payload = {
        pickup: pickup,
        destination: destination,
        vehicle: document.getElementById("rideVehicle").value,
        passengers: document.getElementById("passengerCount").value,
        fare: Number(document.getElementById("estimatedFare").textContent.replace(/[^\d]/g, "")) || 0
    };

    if (sessionToken && state.user && state.user.role === "passenger") {
        try {
            const result = await apiRequest("/api/rides", { method: "POST", body: JSON.stringify(payload) });
            state.rides.push(result.ride);
            state.activeRideId = result.ride.id;
            renderPassenger();
            showToast("Ride request created successfully.");
            return;
        } catch (error) {
            showToast(error.message);
            return;
        }
    }

    const fareText = document.getElementById("estimatedFare").textContent.replace(/[^\d]/g, "");
    const ride = {
        id: state.nextRideId++,
        pickup: pickup,
        destination: destination,
        vehicle: document.getElementById("rideVehicle").value,
        passengers: document.getElementById("passengerCount").value,
        fare: Number(fareText),
        status: "Requested",
        passengerName: state.user.name,
        passengerEmail: state.user.email,
        passengerPhone: state.user.phone || "Phone shared after acceptance",
        driverName: "",
        driverEmail: "",
        ignoredDriverEmails: [],
        rating: null
    };
    state.rides.push(ride);
    state.activeRideId = ride.id;
    renderPassenger();
    showToast("Demo ride request created. No real drivers were notified.");
}

async function cancelCurrentRide() {
    const ride = getActiveRide();
    if (!ride || !["Requested", "Accepted"].includes(ride.status)) return;

    if (sessionToken && state.user && state.user.role === "passenger") {
        try {
            const result = await apiRequest("/api/rides/" + ride.id + "/cancel", { method: "POST" });
            const rideIndex = state.rides.findIndex(function(item) { return item.id === result.ride.id; });
            if (rideIndex >= 0) state.rides[rideIndex] = result.ride;
            renderPassenger();
            showToast("Ride cancelled.");
            return;
        } catch (error) {
            showToast(error.message);
            return;
        }
    }

    ride.status = "Cancelled";
    renderPassenger();
    showToast("Demo ride cancelled.");
}

async function rateCurrentRide() {
    const ride = getActiveRide();
    const rating = document.getElementById("driverRating").value;
    if (!ride || !rating) {
        showToast("Select a rating first.");
        return;
    }

    if (sessionToken && state.user && state.user.role === "passenger") {
        try {
            const result = await apiRequest("/api/rides/" + ride.id + "/rate", {
                method: "POST",
                body: JSON.stringify({ rating: Number(rating) })
            });
            const rideIndex = state.rides.findIndex(function(item) { return item.id === result.ride.id; });
            if (rideIndex >= 0) state.rides[rideIndex] = result.ride;
            renderPassenger();
            showToast("Thanks for rating your driver.");
            return;
        } catch (error) {
            showToast(error.message);
            return;
        }
    }

    ride.rating = Number(rating);
    renderPassenger();
    showToast("Thanks for rating your driver.");
}

async function acceptRide(id) {
    const ride = state.rides.find(function(item) { return item.id === id; });
    if (!ride || ride.status !== "Requested") {
        showToast("This ride request is no longer available.");
        renderDriver();
        return;
    }

    if (sessionToken && state.user && state.user.role === "driver") {
        try {
            const result = await apiRequest("/api/rides/" + id + "/accept", { method: "POST" });
            const rideIndex = state.rides.findIndex(function(item) { return item.id === result.ride.id; });
            if (rideIndex >= 0) state.rides[rideIndex] = result.ride;
            renderDriver();
            showToast("Ride accepted.");
            return;
        } catch (error) {
            showToast(error.message);
            renderDriver();
            return;
        }
    }

    ride.status = "Accepted";
    ride.driverName = state.user.name;
    ride.driverEmail = state.user.email;
    ride.driverPhone = state.user.phone || "";
    ride.driverVehicle = [state.user.vehicleModel, state.user.vehicleType].filter(Boolean).join(" · ") || "Demo vehicle";
    renderDriver();
    showToast("Ride accepted in this demo session.");
}

async function rejectRide(id) {
    const ride = state.rides.find(function(item) { return item.id === id; });
    if (!ride || ride.status !== "Requested") return;

    if (sessionToken && state.user && state.user.role === "driver") {
        try {
            const result = await apiRequest("/api/rides/" + id + "/reject", { method: "POST" });
            const rideIndex = state.rides.findIndex(function(item) { return item.id === result.ride.id; });
            if (rideIndex >= 0) state.rides[rideIndex] = result.ride;
            renderDriver();
            showToast("Request hidden from your list.");
            return;
        } catch (error) {
            showToast(error.message);
            return;
        }
    }

    ride.ignoredDriverEmails.push(state.user.email);
    renderDriver();
    showToast("Request hidden from your demo list.");
}

async function advanceRideStatus() {
    const ride = state.rides.find(function(item) {
        return item.driverEmail === state.user.email && item.status !== "Completed" && item.status !== "Cancelled";
    });
    if (!ride) return;

    if (sessionToken && state.user && state.user.role === "driver") {
        try {
            const result = await apiRequest("/api/rides/" + ride.id + "/advance", { method: "POST" });
            const rideIndex = state.rides.findIndex(function(item) { return item.id === result.ride.id; });
            if (rideIndex >= 0) state.rides[rideIndex] = result.ride;
            renderDriver();
            showToast("Ride status updated: " + result.ride.status);
            return;
        } catch (error) {
            showToast(error.message);
            return;
        }
    }

    const nextIndex = rideStages.indexOf(ride.status) + 1;
    ride.status = rideStages[nextIndex];
    if (ride.status === "Completed") {
        renderDriver();
        showToast("Ride completed. Earnings updated in demo.");
        return;
    }
    renderDriver();
    showToast("Ride status updated: " + ride.status);
}

document.querySelectorAll("[data-role]").forEach(function(button) {
    button.addEventListener("click", function() { setRole(button.dataset.role); });
});

document.getElementById("loginTab").addEventListener("click", function() { setAuthMode("login"); });
document.getElementById("signupTab").addEventListener("click", function() { setAuthMode("signup"); });
document.getElementById("forgotPassword").addEventListener("click", function() {
    authMessage.textContent = "Password reset will be available when the authentication backend is connected.";
});

document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (sessionToken) {
        try {
            const response = await apiRequest("/api/me");
            if (response.user) {
                state.user = response.user;
                state.rides = [];
                await refreshDashboard();
                enterDemoDashboard(response.user);
                showToast("Logged in successfully.");
                return;
            }
        } catch (error) {
            clearSession();
        }
    }

    if (!email || !password) {
        authMessage.textContent = "Email and password are required.";
        return;
    }

    try {
        const response = await apiRequest("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ role: state.role, email: email, password: password })
        });
        saveSession(response.token);
        const user = response.user;
        state.rides = [];
        enterDemoDashboard(user);
        await refreshDashboard();
        showToast("Logged in successfully.");
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

document.getElementById("signupForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (password !== confirmPassword) {
        authMessage.textContent = "Passwords do not match.";
        return;
    }

    const payload = {
        role: state.role,
        name: document.getElementById("signupName").value.trim(),
        email: document.getElementById("signupEmail").value.trim(),
        phone: document.getElementById("signupPhone").value.trim(),
        licenseNumber: document.getElementById("licenseNumber").value.trim(),
        vehicleType: document.getElementById("vehicleType").value,
        vehicleRegistration: document.getElementById("vehicleRegistration").value.trim(),
        vehicleModel: document.getElementById("vehicleModel").value.trim(),
        password: password
    };

    try {
        const response = await apiRequest("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        saveSession(response.token);
        state.rides = [];
        enterDemoDashboard(response.user);
        await refreshDashboard();
        showToast(state.role === "driver"
            ? "Driver profile created successfully."
            : "Passenger profile created successfully.");
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

document.getElementById("logoutButton").addEventListener("click", function() {
    clearSession();
    state.user = null;
    state.driverOnline = false;
    authScreen.hidden = false;
    passengerDashboard.hidden = true;
    driverDashboard.hidden = true;
    this.hidden = true;
    document.getElementById("loginForm").reset();
    document.getElementById("signupForm").reset();
    document.getElementById("driverFields").hidden = true;
    setAuthMode("login");
    window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("rideForm").addEventListener("submit", requestRide);
["pickup", "destination", "rideVehicle"].forEach(function(id) {
    document.getElementById(id).addEventListener("change", estimateFare);
});

document.getElementById("availabilityToggle").addEventListener("click", function() {
    state.driverOnline = !state.driverOnline;
    renderDriver();
    showToast(state.driverOnline ? "You are online in this demo." : "You are offline.");
});

populateLocations();
setRole("passenger");

if (sessionToken) {
    apiRequest("/api/me")
        .then(function(response) {
            enterDemoDashboard(response.user);
            return refreshDashboard();
        })
        .catch(function() {
            clearSession();
        });
}