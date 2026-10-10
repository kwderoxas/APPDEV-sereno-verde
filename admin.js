const API_URL = "/api/bookings";

let allBookings = [];
let selectedCalendarDate = null;
let adminCalendarDate = new Date();
let currentEditBooking = null;
let feedbackRecords = [];

/* Helpers */

function fieldValue(booking, keys, fallback = "") {
    for (const key of keys) {
        const value = booking?.[key];
        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }
    return fallback;
}

function bookingId(booking) {
    return fieldValue(booking, ["id", "bookingId", "booking_id", "bookingID"], "");
}

function guestName(booking) {
    return fieldValue(booking, ["fullName", "full_name", "guest_name", "name"], "Guest name unavailable");
}

function guestEmail(booking) {
    return fieldValue(booking, ["email", "guest_email"], "");
}

function guestPhone(booking) {
    return fieldValue(booking, ["phone", "phone_number", "phoneNumber"], "");
}

function bookingDate(booking) {
    const raw = fieldValue(booking, [
        "booking_date", "bookingDate", "date", "check_in", "checkIn", "selected_date"
    ], "");

    if (!raw) return "";

    const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
}

function accommodationName(booking) {
    return fieldValue(booking, [
        "accommodation", "room", "unit", "villa", "room_name"
    ], "Other / unspecified");
}

function stayType(booking) {
    return String(fieldValue(booking, [
        "booking_type", "bookingType", "stay_type", "type"
    ], "22hours")).toLowerCase();
}

function bookingStatus(booking) {
    return String(fieldValue(booking, [
        "status", "booking_status", "bookingStatus"
    ], "pending")).toLowerCase();
}

function guestCount(booking) {
    return fieldValue(booking, ["guests", "numberOfGuests", "number_of_guests"], "—");
}

function eventType(booking) {
    return fieldValue(booking, ["eventType", "event_type"], "—");
}

function readableDate(dateString) {
    if (!dateString) return "Date unavailable";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function initials(name) {
    return String(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join("") || "GU";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function normalizedStatus(status) {
    if (["confirmed", "approved", "accepted"].includes(status)) return "confirmed";
    if (["cancelled", "canceled"].includes(status)) return "cancelled";
    if (["rejected", "declined"].includes(status)) return "rejected";
    if (["blocked"].includes(status)) return "blocked";
    return "pending";
}

function isCancelled(booking) {
    return ["cancelled", "canceled", "rejected", "declined"].includes(bookingStatus(booking));
}

function isActiveBooking(booking) {
    return !isCancelled(booking);
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function setEmpty(container, message) {
    container.innerHTML = '<div class="empty-table">' + escapeHTML(message) + '</div>';
}

function getMonthKey(date) {
    return date.slice(0, 7);
}

function dateToLocalKey(date) {
    return date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
}

function getMonthBookings(year, monthIndex) {
    const prefix = year + "-" + String(monthIndex + 1).padStart(2, "0") + "-";
    return allBookings.filter(booking => bookingDate(booking).startsWith(prefix));
}

function sortByDate(records) {
    return [...records].sort((a, b) => {
        const dateCompare = bookingDate(a).localeCompare(bookingDate(b));
        if (dateCompare !== 0) return dateCompare;
        return String(guestName(a)).localeCompare(String(guestName(b)));
    });
}

function getStayLabel(type) {
    if (type.includes("day")) return "Daycation";
    if (type.includes("night")) return "Nightcation";
    return "22 Hours stay";
}

/* Navigation */

const pageTitles = {
    overview: "Overview",
    "new-bookings": "New Bookings",
    "booking-management": "Booking Management",
    calendar: "Reservation Calendar",
    accommodations: "Accommodations",
    guests: "Guest Management",
    reviews: "Reviews & Feedback",
    settings: "Settings"
};

function navigateToPage(page) {
    if (!pageTitles[page]) return;

    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.remove("active");
    });

    const target = document.getElementById("page-" + page);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    document.getElementById("breadcrumbText").textContent = pageTitles[page];
    document.getElementById("sidebar").classList.remove("open");

    if (page === "new-bookings") renderNewBookings();
    if (page === "booking-management") renderManagementTable();
    if (page === "calendar") renderAdminCalendar();
    if (page === "guests") renderGuests();
    if (page === "reviews") renderReviews();
}

document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => navigateToPage(button.dataset.page));
});

document.querySelectorAll("[data-go-page]").forEach(button => {
    button.addEventListener("click", () => navigateToPage(button.dataset.goPage));
});

document.getElementById("menuButton").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

document.addEventListener("click", event => {
    const sidebar = document.getElementById("sidebar");
    const menuButton = document.getElementById("menuButton");

    if (window.innerWidth <= 850 &&
        sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuButton.contains(event.target)) {
        sidebar.classList.remove("open");
    }
});

/* Fetch backend records */

async function loadBookings() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error("The booking API returned an error.");
        }

        const data = await response.json();

        allBookings = Array.isArray(data)
            ? data
            : Array.isArray(data.bookings)
                ? data.bookings
                : [];

        updateOverview();
        populateMonthFilters();
        renderNewBookings();
        renderManagementTable();
        renderAdminCalendar();
        renderGuests();
        renderReviews();

        return true;
    } catch (error) {
        console.error("Could not load booking records:", error);
        showToast("Unable to load bookings. Check that the Express server is running.");
        updateOverview();
        populateMonthFilters();
        renderNewBookings();
        renderManagementTable();
        renderAdminCalendar();
        renderGuests();
        renderReviews();
        return false;
    }
}

/* Overview statistics */

function updateOverview() {
    const now = new Date();
    const thisMonthPrefix = dateToLocalKey(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7);

    document.getElementById("totalBookings").textContent = allBookings.length;

    document.getElementById("pendingBookings").textContent =
        allBookings.filter(b => normalizedStatus(bookingStatus(b)) === "pending").length;

    document.getElementById("monthlyBookings").textContent =
        allBookings.filter(b => bookingDate(b).startsWith(thisMonthPrefix)).length;

    document.getElementById("cancelledBookings").textContent =
        allBookings.filter(isCancelled).length;

    document.getElementById("pendingBadge").textContent =
        allBookings.filter(b => normalizedStatus(bookingStatus(b)) === "pending").length;

    renderMonthlyChart();
    renderYearlyChart();
    renderRecentBookings();
}

function makeSVGElement(tag, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);

    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }

    return element;
}

function addSVGText(svg, x, y, text, options = {}) {
    const node = makeSVGElement("text", {
        x, y,
        fill: options.fill || "#a39a92",
        "font-size": options.size || 10,
        "text-anchor": options.anchor || "middle",
        "font-family": "Arial, sans-serif"
    });

    node.textContent = text;
    svg.appendChild(node);
    return node;
}

function drawBarChart(svgId, labels, values, options = {}) {
    const svg = document.getElementById(svgId);
    svg.innerHTML = "";

    const width = options.width || 600;
    const height = 260;
    const left = 36;
    const right = 14;
    const top = 17;
    const bottom = 39;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maximum = Math.max(4, ...values);
    const step = Math.max(1, Math.ceil(maximum / 4));
    const roundedMax = Math.ceil(maximum / step) * step;
    const slotWidth = plotWidth / Math.max(labels.length, 1);
    const barWidth = Math.min(options.barWidth || 24, slotWidth * 0.64);

    for (let i = 0; i <= 4; i++) {
        const value = roundedMax * i / 4;
        const y = top + plotHeight - (value / roundedMax) * plotHeight;

        svg.appendChild(makeSVGElement("line", {
            x1: left, y1: y, x2: width - right, y2: y,
            stroke: "#eee8e2", "stroke-width": 1
        }));

        addSVGText(svg, left - 8, y + 3, Math.round(value), {
            anchor: "end",
            size: 9
        });
    }

    values.forEach((value, index) => {
        const x = left + slotWidth * index + (slotWidth - barWidth) / 2;
        const barHeight = (value / roundedMax) * plotHeight;
        const y = top + plotHeight - barHeight;

        const bar = makeSVGElement("rect", {
            x, y, width: barWidth, height: Math.max(barHeight, value > 0 ? 2 : 0),
            rx: 4,
            fill: options.color || "#8da5ba"
        });

        const title = makeSVGElement("title");
        title.textContent = labels[index] + ": " + value + " bookings";
        bar.appendChild(title);
        svg.appendChild(bar);

        addSVGText(svg, x + barWidth / 2, height - 16, labels[index], {
            size: labels.length > 8 ? 8 : 9
        });
    });
}

function renderMonthlyChart() {
    const now = new Date();
    const labels = [];
    const values = [];

    for (let offset = 11; offset >= 0; offset--) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const year = date.getFullYear();
        const month = date.getMonth();

        labels.push(date.toLocaleDateString("en-US", { month: "short" }));

        values.push(allBookings.filter(booking => {
            const key = bookingDate(booking);
            return key.startsWith(year + "-" + String(month + 1).padStart(2, "0") + "-");
        }).length);
    }

    drawBarChart("monthlyChart", labels, values, {
        width: 600,
        color: "#8da5ba",
        barWidth: 25
    });
}

function renderYearlyChart() {
    const currentYear = new Date().getFullYear();
    const labels = [];
    const values = [];

    for (let year = 2020; year <= currentYear; year++) {
        labels.push(String(year));

        values.push(allBookings.filter(booking => {
            return bookingDate(booking).startsWith(year + "-");
        }).length);
    }

    drawBarChart("yearlyChart", labels, values, {
        width: 440,
        color: "#b99b83",
        barWidth: 23
    });
}

function renderRecentBookings() {
    const container = document.getElementById("recentBookings");
    const recent = [...allBookings].sort((a, b) => {
        const aId = Number(bookingId(a)) || 0;
        const bId = Number(bookingId(b)) || 0;

        if (aId && bId && aId !== bId) return bId - aId;
        return bookingDate(b).localeCompare(bookingDate(a));
    }).slice(0, 5);

    if (!recent.length) {
        setEmpty(container, "No booking records are available yet.");
        return;
    }

    container.innerHTML = renderBookingTable(recent, false);
}

/* Booking table */

function renderBookingTable(records, showActions = true) {
    if (!records.length) {
        return '<div class="empty-table">No bookings match your filters.</div>';
    }

    const rows = records.map(booking => {
        const name = guestName(booking);
        const status = normalizedStatus(bookingStatus(booking));
        const id = bookingId(booking);

        return `
            <tr>
                <td>${escapeHTML(id || "—")}</td>
                <td>
                    <div class="guest-cell">
                        <span class="small-avatar">${escapeHTML(initials(name))}</span>
                        <span>
                            <strong>${escapeHTML(name)}</strong>
                            <small>${escapeHTML(guestEmail(booking) || "No email provided")}</small>
                        </span>
                    </div>
                </td>
                <td>${escapeHTML(readableDate(bookingDate(booking)))}</td>
                <td>${escapeHTML(accommodationName(booking))}</td>
                <td>${escapeHTML(getStayLabel(stayType(booking)))}</td>
                <td><span class="status-pill ${status}">${escapeHTML(status)}</span></td>
                ${showActions ? `
                    <td>
                        <div class="row-actions">
                            <button class="row-action" data-edit-booking="${escapeHTML(id)}">View / Edit</button>
                        </div>
                    </td>` : ""}
            </tr>
        `;
    }).join("");

    return `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>GUEST</th>
                    <th>DATE</th>
                    <th>ACCOMMODATION</th>
                    <th>STAY TYPE</th>
                    <th>STATUS</th>
                    ${showActions ? "<th>ACTIONS</th>" : ""}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderManagementTable() {
    const container = document.getElementById("managementTable");
    const statusFilter = document.getElementById("managementStatusFilter").value;
    const typeFilter = document.getElementById("managementTypeFilter").value;
    const query = document.getElementById("managementSearch").value.toLowerCase().trim();

    const filtered = sortByDate(allBookings.filter(booking => {
        const status = normalizedStatus(bookingStatus(booking));
        const type = stayType(booking);

        const matchesStatus = statusFilter === "all" || status === statusFilter;
        const matchesType = typeFilter === "all" || type.includes(typeFilter);

        const searchable = [
            bookingId(booking),
            guestName(booking),
            guestEmail(booking),
            guestPhone(booking),
            accommodationName(booking),
            bookingDate(booking)
        ].join(" ").toLowerCase();

        return matchesStatus && matchesType && searchable.includes(query);
    }));

    container.innerHTML = renderBookingTable(filtered, true);
}

/* Month filter and date cards */

function populateMonthFilters() {
    const monthSelect = document.getElementById("bookingMonthFilter");
    const yearSelect = document.getElementById("bookingYearFilter");

    const previousMonth = monthSelect.value;
    const previousYear = yearSelect.value;

    const monthNames = Array.from({ length: 12 }, (_, month) =>
        new Date(2026, month, 1).toLocaleDateString("en-US", { month: "long" })
    );

    monthSelect.innerHTML = monthNames.map((name, index) =>
        `<option value="${index}">${name}</option>`
    ).join("");

    const currentMonth = new Date().getMonth();
    monthSelect.value = previousMonth !== "" ? previousMonth : String(currentMonth);

    const years = new Set([String(new Date().getFullYear())]);

    allBookings.forEach(booking => {
        const key = bookingDate(booking);
        if (key) years.add(key.slice(0, 4));
    });

    const sortedYears = [...years].sort((a, b) => Number(b) - Number(a));

    yearSelect.innerHTML = sortedYears.map(year =>
        `<option value="${escapeHTML(year)}">${escapeHTML(year)}</option>`
    ).join("");

    yearSelect.value = sortedYears.includes(previousYear)
        ? previousYear
        : String(new Date().getFullYear());
}

function getMonthDateCards(year, monthIndex) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const results = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = year + "-" +
            String(monthIndex + 1).padStart(2, "0") + "-" +
            String(day).padStart(2, "0");

        const dayBookings = sortByDate(allBookings.filter(booking =>
            bookingDate(booking) === dateKey && !isCancelled(booking)
        ));

        results.push({ dateKey, day, bookings: dayBookings });
    }

    return results;
}

function renderGuestEntry(booking) {
    const name = guestName(booking);
    const type = stayType(booking);
    const status = normalizedStatus(bookingStatus(booking));

    let typeClass = "whole-day";
    if (type.includes("day")) typeClass = "daycation";
    if (type.includes("night")) typeClass = "nightcation";
    if (status === "pending") typeClass += " pending";

    return `
        <div class="guest-entry ${typeClass}">
            <div class="guest-name">${escapeHTML(name)}</div>
            <div class="guest-detail">
                ${escapeHTML(getStayLabel(type))}<br>
                ${escapeHTML(accommodationName(booking))}<br>
                Guests: ${escapeHTML(guestCount(booking))}
            </div>
            <span class="entry-status">${escapeHTML(status)}</span>
        </div>
    `;
}

function renderNewBookings() {
    const grid = document.getElementById("bookingDateGrid");
    const monthIndex = Number(document.getElementById("bookingMonthFilter").value);
    const year = Number(document.getElementById("bookingYearFilter").value);

    if (!Number.isFinite(monthIndex) || !Number.isFinite(year)) {
        setEmpty(grid, "Choose a month and year.");
        return;
    }

    const monthName = new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });

    document.getElementById("bookingMonthHeading").textContent =
        monthName + " · Daily reservation schedule";

    const query = document.getElementById("bookingSearch").value.toLowerCase().trim();
    const cards = getMonthDateCards(year, monthIndex);

    const filteredCards = cards.filter(card => {
        if (!query) return true;

        return card.bookings.some(booking => [
            guestName(booking),
            guestEmail(booking),
            accommodationName(booking),
            stayType(booking),
            bookingId(booking)
        ].join(" ").toLowerCase().includes(query));
    });

    if (!filteredCards.length) {
        setEmpty(grid, "No matching reservations were found.");
        return;
    }

    grid.innerHTML = filteredCards.map(card => {
        const date = new Date(year, monthIndex, card.day);
        const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
        const activeCount = card.bookings.length;

        return `
            <article class="date-card">
                <div class="date-card-head">
                    <div class="date-number">
                        <strong>${card.day}</strong>
                        <span>${escapeHTML(weekday)}</span>
                    </div>
                    <div class="date-heading">
                        <h3>${escapeHTML(date.toLocaleDateString("en-US", { month: "long" }))} ${card.day}</h3>
                        <p>${activeCount} reservation${activeCount === 1 ? "" : "s"}</p>
                    </div>
                </div>

                <div class="date-card-body">
                    ${activeCount
                        ? card.bookings.map(renderGuestEntry).join("")
                        : '<div class="empty-date">No reservations</div>'}
                </div>

                <div class="date-card-foot">
                    <span>${activeCount ? "Guest schedule" : "Available record slot"}</span>
                    <button class="text-button" data-view-date="${card.dateKey}">Details →</button>
                </div>
            </article>
        `;
    }).join("");
}

document.getElementById("bookingMonthFilter").addEventListener("change", renderNewBookings);
document.getElementById("bookingYearFilter").addEventListener("change", renderNewBookings);
document.getElementById("bookingSearch").addEventListener("input", renderNewBookings);

/* Admin calendar */

function renderAdminCalendar() {
    const grid = document.getElementById("adminCalendarGrid");
    const year = adminCalendarDate.getFullYear();
    const month = adminCalendarDate.getMonth();

    document.getElementById("adminCalendarMonth").textContent =
        adminCalendarDate.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric"
        });

    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    grid.innerHTML = weekdayLabels.map(day =>
        `<div style="text-align:center;padding:9px 0;color:#94877e;font-size:10px">${day}</div>`
    ).join("");

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
        grid.insertAdjacentHTML("beforeend",
            '<div style="min-height:70px"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = dateToLocalKey(new Date(year, month, day));
        const accommodationFilter =
            document.getElementById("calendarAccommodationFilter").value;

        const dayBookings = allBookings.filter(booking => {
            if (bookingDate(booking) !== dateKey || isCancelled(booking)) return false;

            if (accommodationFilter === "all") return true;

            const name = accommodationName(booking).toLowerCase();

            if (accommodationFilter === "other") {
                return !name.includes("tuscan villa") && !name.includes("spanish villa");
            }

            return name.includes(accommodationFilter);
        });

        const isSelected = selectedCalendarDate === dateKey;
        const isToday = dateToLocalKey(new Date()) === dateKey;

        const button = document.createElement("button");
        button.type = "button";
        button.style.cssText = `
            min-width:0;
            min-height:70px;
            padding:7px;
            border-radius:8px;
            border:1px solid ${isSelected ? "#839db5" : "#e8e0d9"};
            background:${isSelected ? "#e6edf4" : "#fff"};
            text-align:left;
            color:#45413f;
            overflow:hidden;
        `;

        button.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:3px">
                <strong style="font-size:12px">${day}</strong>
                ${isToday ? '<span style="font-size:8px;color:#526e89">TODAY</span>' : ""}
            </div>
            <div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap">
                ${dayBookings.slice(0, 4).map(booking => `
                    <span title="${escapeHTML(guestName(booking))}"
                        style="width:7px;height:7px;border-radius:50%;background:${
                            stayType(booking).includes("day") ? "#b99b83" :
                            stayType(booking).includes("night") ? "#839db5" : "#8cae91"
                        }"></span>
                `).join("")}
            </div>
            ${dayBookings.length
                ? `<div style="font-size:9px;color:#7d746c;margin-top:5px">${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"}</div>`
                : '<div style="font-size:9px;color:#c0b7af;margin-top:5px">No bookings</div>'}
        `;

        button.addEventListener("click", () => {
            selectedCalendarDate = dateKey;
            renderAdminCalendar();
            renderSelectedCalendarDate();
        });

        grid.appendChild(button);
    }

    renderSelectedCalendarDate();
}

function renderSelectedCalendarDate() {
    const label = document.getElementById("adminCalendarSelectedLabel");
    const container = document.getElementById("adminCalendarSelectedBookings");

    if (!selectedCalendarDate) {
        label.textContent = "Select a date to see reservations.";
        setEmpty(container, "No date selected.");
        return;
    }

    label.textContent = readableDate(selectedCalendarDate);

    const accommodationFilter =
        document.getElementById("calendarAccommodationFilter").value;

    const records = sortByDate(allBookings.filter(booking => {
        if (bookingDate(booking) !== selectedCalendarDate || isCancelled(booking)) return false;
        if (accommodationFilter === "all") return true;

        const name = accommodationName(booking).toLowerCase();

        if (accommodationFilter === "other") {
            return !name.includes("tuscan villa") && !name.includes("spanish villa");
        }

        return name.includes(accommodationFilter);
    }));

    if (!records.length) {
        setEmpty(container, "No active reservations on this date.");
        return;
    }

    container.innerHTML = records.map(renderGuestEntry).join("");
}

document.getElementById("calendarPrevious").addEventListener("click", () => {
    adminCalendarDate = new Date(
        adminCalendarDate.getFullYear(),
        adminCalendarDate.getMonth() - 1,
        1
    );
    renderAdminCalendar();
});

document.getElementById("calendarNext").addEventListener("click", () => {
    adminCalendarDate = new Date(
        adminCalendarDate.getFullYear(),
        adminCalendarDate.getMonth() + 1,
        1
    );
    renderAdminCalendar();
});

document.getElementById("calendarAccommodationFilter").addEventListener("change", () => {
    renderAdminCalendar();
});

/* Guests */

function renderGuests() {
    const unique = new Map();

    allBookings.forEach(booking => {
        const email = guestEmail(booking).trim().toLowerCase();
        const name = guestName(booking).trim().toLowerCase();
        const key = email || name;

        if (key && key !== "guest name unavailable") {
            if (!unique.has(key)) unique.set(key, booking);
        }
    });

    const guests = [...unique.values()];

    document.getElementById("uniqueGuests").textContent = guests.length;
    document.getElementById("guestsWithEmail").textContent =
        guests.filter(guest => guestEmail(guest)).length;

    const query = document.getElementById("guestSearch").value.toLowerCase().trim();

    const filtered = guests.filter(guest => [
        guestName(guest),
        guestEmail(guest),
        guestPhone(guest)
    ].join(" ").toLowerCase().includes(query));

    const container = document.getElementById("guestTable");

    if (!filtered.length) {
        setEmpty(container, "No guest records match your search.");
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>GUEST</th>
                    <th>PHONE</th>
                    <th>EMAIL</th>
                    <th>BOOKINGS</th>
                    <th>LATEST DATE</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(guest => {
                    const email = guestEmail(guest).trim().toLowerCase();
                    const name = guestName(guest).trim().toLowerCase();

                    const guestBookings = allBookings.filter(booking => {
                        if (email) return guestEmail(booking).trim().toLowerCase() === email;
                        return guestName(booking).trim().toLowerCase() === name;
                    });

                    const latest = [...guestBookings].sort((a, b) =>
                        bookingDate(b).localeCompare(bookingDate(a))
                    )[0];

                    return `
                        <tr>
                            <td>
                                <div class="guest-cell">
                                    <span class="small-avatar">${escapeHTML(initials(guestName(guest)))}</span>
                                    <strong>${escapeHTML(guestName(guest))}</strong>
                                </div>
                            </td>
                            <td>${escapeHTML(guestPhone(guest) || "—")}</td>
                            <td>${escapeHTML(guestEmail(guest) || "—")}</td>
                            <td>${guestBookings.length}</td>
                            <td>${escapeHTML(readableDate(latest ? bookingDate(latest) : ""))}</td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;
}

document.getElementById("guestSearch").addEventListener("input", renderGuests);

/* Reviews */

async function renderReviews() {
    const container = document.getElementById("reviewContent");

    try {
        const response = await fetch("/api/feedback");

        if (!response.ok) throw new Error("Feedback endpoint unavailable");

        const data = await response.json();
        feedbackRecords = Array.isArray(data)
            ? data
            : Array.isArray(data.feedback)
                ? data.feedback
                : [];

        if (!feedbackRecords.length) {
            setEmpty(container, "No feedback records have been submitted yet.");
            return;
        }

        container.innerHTML = feedbackRecords.map(review => {
            const name = fieldValue(review, ["guestName", "guest_name", "name"], "Guest");
            const comment = fieldValue(review, ["comment", "feedback", "message", "review"], "No comment provided.");
            const rating = Math.max(0, Math.min(5, Number(fieldValue(review, ["rating", "stars"], 0))));

            return `
                <article class="review-card">
                    <div class="review-stars">${"★".repeat(rating)}${"☆".repeat(5-rating)}</div>
                    <p>${escapeHTML(comment)}</p>
                    <small>${escapeHTML(name)}</small>
                </article>
            `;
        }).join("");

    } catch {
        setEmpty(container, "No feedback API is connected yet. Add a reviews endpoint to display guest feedback here.");
    }
}

/* Modal: inspect and attempt to update a booking */

function openBookingModal(id) {
    const booking = allBookings.find(item => String(bookingId(item)) === String(id));

    if (!booking) {
        showToast("This booking could not be found in the loaded records.");
        return;
    }

    currentEditBooking = booking;

    document.getElementById("editBookingId").value = bookingId(booking);
    document.getElementById("editGuestName").value = guestName(booking);
    document.getElementById("editBookingDate").value = bookingDate(booking);
    document.getElementById("editBookingStatus").value = normalizedStatus(bookingStatus(booking));

    const accommodation = accommodationName(booking);
    const accommodationSelect = document.getElementById("editAccommodation");

    const matchingAccommodation = [...accommodationSelect.options].find(option =>
        option.value.toLowerCase() === accommodation.toLowerCase()
    );

    accommodationSelect.value = matchingAccommodation
        ? matchingAccommodation.value
        : "Other";

    const type = stayType(booking);
    document.getElementById("editBookingType").value =
        type.includes("day") ? "daycation" :
        type.includes("night") ? "nightcation" : "22hours";

    document.getElementById("editAdminNotes").value = "";

    document.getElementById("bookingModal").classList.add("open");
}

function closeBookingModal() {
    document.getElementById("bookingModal").classList.remove("open");
    currentEditBooking = null;
}

document.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit-booking]");
    if (editButton) openBookingModal(editButton.dataset.editBooking);

    const dateButton = event.target.closest("[data-view-date]");
    if (dateButton) {
        const date = dateButton.dataset.viewDate;
        adminCalendarDate = new Date(
            Number(date.slice(0, 4)),
            Number(date.slice(5, 7)) - 1,
            1
        );
        selectedCalendarDate = date;
        navigateToPage("calendar");
        renderAdminCalendar();
    }
});

document.getElementById("closeModal").addEventListener("click", closeBookingModal);
document.getElementById("cancelModal").addEventListener("click", closeBookingModal);

document.getElementById("bookingModal").addEventListener("click", event => {
    if (event.target.id === "bookingModal") closeBookingModal();
});

document.getElementById("bookingEditForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentEditBooking) return;

    const id = bookingId(currentEditBooking);

    if (!id) {
        showToast("This booking has no ID. It cannot be updated safely.");
        return;
    }

    const payload = {
        booking_date: document.getElementById("editBookingDate").value,
        accommodation: document.getElementById("editAccommodation").value,
        booking_type: document.getElementById("editBookingType").value,
        status: document.getElementById("editBookingStatus").value
    };

    try {
        const response = await fetch(API_URL + "/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error("The backend does not confirm that this booking was updated.");
        }

        closeBookingModal();
        await loadBookings();
        showToast("Booking updated.");
    } catch (error) {
        showToast(error.message + " Add a compatible PUT /api/bookings/:id route first.");
    }
});

/* Add booking shortcut */

function openAddBookingPage() {
    window.location.href = "booking.html";
}

document.getElementById("newBookingButton").addEventListener("click", openAddBookingPage);
document.getElementById("managementAddButton").addEventListener("click", openAddBookingPage);

document.querySelectorAll("[data-accommodation-search]").forEach(button => {
    button.addEventListener("click", () => {
        const name = button.dataset.accommodationSearch;
        navigateToPage("booking-management");
        document.getElementById("managementSearch").value = name;
        renderManagementTable();
    });
});

/* Refresh controls */

document.getElementById("refreshOverview").addEventListener("click", loadBookings);
document.getElementById("refreshNewBookings").addEventListener("click", loadBookings);
document.getElementById("refreshManagement").addEventListener("click", loadBookings);
document.getElementById("calendarRefresh").addEventListener("click", loadBookings);
document.getElementById("refreshGuests").addEventListener("click", loadBookings);
document.getElementById("refreshReviews").addEventListener("click", renderReviews);

document.getElementById("managementStatusFilter").addEventListener("change", renderManagementTable);
document.getElementById("managementTypeFilter").addEventListener("change", renderManagementTable);
document.getElementById("managementSearch").addEventListener("input", renderManagementTable);

/* Local display preferences only */

document.getElementById("settingsForm").addEventListener("submit", event => {
    event.preventDefault();

    showToast("Display settings saved for this page session. Backend settings are not configured.");
});

/* Initial setup */

document.getElementById("todayLabel").textContent =
    new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });

populateMonthFilters();
renderMonthlyChart();
renderYearlyChart();
renderNewBookings();
renderManagementTable();
renderAdminCalendar();
renderGuests();
renderReviews();
loadBookings();