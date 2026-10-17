
const calendarGrid = document.getElementById("calendarGrid");
const monthTitle = document.getElementById("monthTitle");
const calendarMessage = document.getElementById("calendarMessage");
const bookingForm = document.getElementById("bookingForm");
const statusMessage = document.getElementById("statusMessage");
const bookingSummary = document.getElementById("bookingSummary");
const summaryText = document.getElementById("summaryText");
const submitButton = document.getElementById("submitButton");

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

function getBookingsForDate(dateKey) {
    const selectedAccommodation = document.getElementById("accommodation").value
        .trim()
        .toLowerCase();

    return bookings.filter(booking => {
        const status = String(
            booking.status || booking.booking_status || "confirmed"
        ).toLowerCase();
        const cancelled = [
            "cancelled",
            "canceled",
            "rejected",
            "declined"
        ].includes(status);
        const existingAccommodation = normalizeAccommodation(booking);

        return normalizeBookingDate(booking) === dateKey &&
            !cancelled &&
            (!selectedAccommodation ||
                !existingAccommodation ||
                existingAccommodation === selectedAccommodation);
    });
}

function isDateAvailableForBooking(dateKey, bookingType = selectedBookingType) {
    if (unavailableDates.has(dateKey)) return false;

    const dateBookings = getBookingsForDate(dateKey);
    if (!dateBookings.length) return true;
    if (dateBookings.some(booking =>
        String(booking.status || booking.booking_status || "").toLowerCase() === "blocked"
    )) {
        return false;
    }

    const types = dateBookings.map(booking =>
        String(booking.booking_type || booking.bookingType || "22hours").toLowerCase()
    );

    if (types.some(type => type === "22hours" || !["daycation", "nightcation"].includes(type))) {
        return false;
    }

    if (bookingType === "22hours") return false;
    return !types.includes(bookingType);
}

function getStatusForDate(dateKey) {
    if (unavailableDates.has(dateKey)) return unavailableDates.get(dateKey);

    const dateBookings = getBookingsForDate(dateKey);
    if (dateBookings.some(booking =>
        String(booking.status || booking.booking_status || "").toLowerCase() === "blocked"
    )) {
        return "blocked";
    }

    const types = dateBookings.map(booking =>
        String(booking.booking_type || booking.bookingType || "22hours").toLowerCase()
    );

    if (
        types.includes("22hours") ||
        types.some(type => !["daycation", "nightcation"].includes(type)) ||
        (types.includes("daycation") && types.includes("nightcation"))
    ) {
        return "booked";
    }
    if (types.includes("nightcation")) return "nightcation";
    if (types.includes("daycation")) return "daycation";
    return "available";
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
        } else if (!isDateAvailableForBooking(dateKey)) {
            button.disabled = true;
            button.title = status === "blocked"
                ? "This date is blocked"
                : status === "booked"
                    ? "This date is fully booked for this accommodation"
                    : bookingTypeDetails[selectedBookingType].label +
                        " is already booked for this accommodation";
        } else {
            button.addEventListener("click", () => selectDate(dateKey));
            button.title = "Select " + formatReadableDate(dateKey) +
                (status === "available" ? "" : " for " + bookingTypeDetails[selectedBookingType].label);
        }

        calendarGrid.appendChild(button);
    }
}

function selectDate(dateKey) {
    if (isDateInPast(dateKey) || !isDateAvailableForBooking(dateKey)) {
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

        if (selectedDate && !isDateAvailableForBooking(selectedDate)) {
            selectedDate = null;
            calendarMessage.textContent =
                "That date is unavailable for this booking type. Please choose another date.";
        }
        renderCalendar();
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
    if (selectedDate && !isDateAvailableForBooking(selectedDate)) {
        selectedDate = null;
        calendarMessage.textContent =
            "That date is unavailable for this accommodation. Please choose another date.";
    }
    renderCalendar();
    updateBookingSummary();
    clearStatus();
});

// Submit booking details to the server and redirect after a confirmed save.
bookingForm.addEventListener("submit", async event => {
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

    if (!isDateAvailableForBooking(selectedDate)) {
        showStatus(
            "This date or booking type is no longer available. Please select another date.",
            "error"
        );

        renderCalendar();
        return;
    }

    if (!bookingForm.reportValidity()) {
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
        const formData = new FormData(bookingForm);
        const response = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...Object.fromEntries(formData.entries()),
                bookingDate: selectedDate,
                bookingType: selectedBookingType
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Your booking could not be submitted.");
        window.location.href = new URL("confirmation.html?booking=" + encodeURIComponent(result.id), window.location.href).href;
    } catch (error) {
        showStatus(error.message || "The booking service is unavailable. Please try again.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Book";
    }
});

// Initial page setup
renderCalendar();

fetch("/api/availability")
    .then(async response => {
        if (!response.ok) throw new Error("Could not load availability from the server.");
        const result = await response.json();
        bookings = Array.isArray(result.bookings) ? result.bookings : [];
        if (selectedDate && !isDateAvailableForBooking(selectedDate)) {
            selectedDate = null;
            calendarMessage.textContent =
                "That date is no longer available. Please choose another date.";
            updateBookingSummary();
        }
        renderCalendar();
    })
    .catch(error => {
        console.error("Could not load booking availability:", error);
        showStatus("Live availability could not be loaded. Please refresh before booking.", "error");
    });
