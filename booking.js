
const calendarGrid = document.getElementById("calendarGrid");
const monthTitle = document.getElementById("monthTitle");
const calendarMessage = document.getElementById("calendarMessage");
const bookingForm = document.getElementById("bookingForm");
const statusMessage = document.getElementById("statusMessage");
const bookingSummary = document.getElementById("bookingSummary");
const summaryText = document.getElementById("summaryText");

let currentDate = new Date(2026, 9, 1);
let selectedDate = null;
let selectedBookingType = "22hours";
let bookings = [];
let unavailableDates = new Map();

const bookingTypeDetails = {
    daycation: {
        label: "Daycation",
        time: "8:00 AM - 6:00 PM"
    },
    nightcation: {
        label: "Nightcation",
        time: "8:00 PM - 6:00 AM"
    },
    "22hours": {
        label: "22 Hours stay",
        time: "8:00 AM - 6:00 AM"
    }
};

// Sample calendar statuses for visual demonstration only.
const sampleCalendarStatuses = {
    "2026-10-17": "daycation",
    "2026-10-18": "nightcation",
    "2026-10-19": "daycation"
};

function formatDateKey(year, month, day) {
    return [
        year,
        String(month + 1).padStart(2, "0"),
        String(day).padStart(2, "0")
    ].join("-");
}

function formatReadableDate(dateString) {
    if (!dateString) return "No date selected";

    const parts = dateString.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = "status-message visible " + type;
}

function clearStatus() {
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
}

function normalizeBookingDate(booking) {
    const possibleValues = [
        booking.booking_date,
        booking.bookingDate,
        booking.date,
        booking.check_in,
        booking.checkIn,
        booking.selected_date
    ];

    for (const value of possibleValues) {
        if (!value) continue;

        const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);

        if (match) return match[1];
    }

    return null;
}

function normalizeAccommodation(booking) {
    return String(
        booking.accommodation ||
        booking.room ||
        booking.unit ||
        booking.villa ||
        ""
    ).trim().toLowerCase();
}

function isSameAccommodation(booking) {
    const existing = normalizeAccommodation(booking);

    const selected = document.getElementById("accommodation").value
        .trim()
        .toLowerCase();

    // If an older booking has no accommodation field,
    // conservatively treat it as unavailable for all accommodations.
    if (!existing || !selected) return true;

    return existing === selected;
}

function getStatusForDate(dateKey) {
    const dateBookings = bookings.filter(booking => {
        const date = normalizeBookingDate(booking);

        const status = String(
            booking.status || booking.booking_status || "confirmed"
        ).toLowerCase();

        const cancelled = [
            "cancelled",
            "canceled",
            "rejected",
            "declined"
        ].includes(status);

        return date === dateKey && !cancelled;
    });

    if (dateBookings.length > 0) {
        const matchingAccommodation = dateBookings.filter(isSameAccommodation);

        if (matchingAccommodation.length > 0) {
            return "booked";
        }
    }

    if (unavailableDates.has(dateKey)) {
        return unavailableDates.get(dateKey);
    }

    return sampleCalendarStatuses[dateKey] || "available";
}

function isDateInPast(dateKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = dateKey.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    return date < today;
}

function renderCalendar() {
    calendarGrid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthTitle.textContent = currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.className = "empty-day";
        empty.setAttribute("aria-hidden", "true");
        calendarGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = formatDateKey(year, month, day);
        const status = getStatusForDate(dateKey);
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = day;
        button.className = "calendar-day " + status;

        button.setAttribute(
            "aria-label",
            formatReadableDate(dateKey) + ", " + status
        );

        if (selectedDate === dateKey) {
            button.classList.add("selected");
            button.setAttribute("aria-pressed", "true");
        } else {
            button.setAttribute("aria-pressed", "false");
        }

        if (isDateInPast(dateKey)) {
            button.disabled = true;
            button.classList.add("blocked");
            button.classList.remove(
                "available",
                "daycation",
                "nightcation"
            );
            button.title = "Past dates cannot be selected";
        } else if (status === "booked" || status === "blocked") {
            button.disabled = true;
            button.title = status === "booked"
                ? "This date is already booked for this accommodation"
                : "This date is blocked";
        } else {
            button.addEventListener("click", () => selectDate(dateKey));
            button.title = "Select " + formatReadableDate(dateKey);
        }

        calendarGrid.appendChild(button);
    }
}

function selectDate(dateKey) {
    const status = getStatusForDate(dateKey);

    if (
        status === "booked" ||
        status === "blocked" ||
        isDateInPast(dateKey)
    ) {
        calendarMessage.textContent =
            "This date is unavailable. Please choose another date.";
        return;
    }

    selectedDate = dateKey;

    calendarMessage.textContent =
        "Selected date: " + formatReadableDate(dateKey);

    clearStatus();
    renderCalendar();
    updateBookingSummary();
}

function updateBookingSummary() {
    if (!selectedDate) {
        bookingSummary.classList.remove("visible");
        return;
    }

    const details = bookingTypeDetails[selectedBookingType];

    summaryText.textContent =
        formatReadableDate(selectedDate) +
        " • " +
        details.label +
        " (" + details.time + ")";

    bookingSummary.classList.add("visible");
}

// Booking type selection
document.querySelectorAll(".booking-option").forEach(option => {
    option.addEventListener("click", () => {
        selectedBookingType = option.dataset.type;

        document.querySelectorAll(".booking-option").forEach(item => {
            const isActive = item === option;

            item.classList.toggle("active", isActive);
            item.setAttribute("aria-pressed", String(isActive));
        });

        updateBookingSummary();
        clearStatus();
    });
});

// Calendar navigation
document.getElementById("previousMonth").addEventListener("click", () => {
    currentDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1
    );

    renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
    currentDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        1
    );

    renderCalendar();
});

// Update availability when accommodation changes
document.getElementById("accommodation").addEventListener("change", () => {
    renderCalendar();
    clearStatus();
});

// Submit booking details and redirect to the confirmation page.
bookingForm.addEventListener("submit", event => {
    event.preventDefault();
    clearStatus();

    if (!selectedDate) {
        showStatus(
            "Please select an available date on the calendar.",
            "error"
        );
        return;
    }

    if (isDateInPast(selectedDate)) {
        showStatus("Please select a future date.", "error");
        return;
    }

    const accommodation =
        document.getElementById("accommodation").value;

    if (!accommodation) {
        showStatus(
            "Please select a villa or accommodation.",
            "error"
        );
        return;
    }

    const status = getStatusForDate(selectedDate);

    if (status === "booked" || status === "blocked") {
        showStatus(
            "This date is no longer available. Please select another date.",
            "error"
        );

        renderCalendar();
        return;
    }

    if (!bookingForm.reportValidity()) {
        return;
    }

    window.location.href = new URL(
        "confirmation.html",
        window.location.href
    ).href;
});

// Initial page setup
renderCalendar();
