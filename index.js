const villaData = {
    tuscan: {
        name: "Tuscan Villa",
        title: "TUSCAN<br>VILLA",
        image: "images/tuscan-villa.jpeg",
        description:
            "Escape the ordinary and enjoy a relaxing private-pool vacation at Tuscan Villa. Designed for comfort, privacy, and unforgettable moments, our villa is the perfect getaway for families, friends, and groups looking to unwind and enjoy quality time together.",
        location: "📍 Pililla Rizal, Philippines",
        theme: "tuscan-theme",
        exploreUrl: "explore.html"
    },

    spanish: {
        name: "Spanish Villa",
        title: "SPANISH<br>VILLA",
        image: "images/spanish-villa.jpeg",
        description:
            "Discover Spanish Villa, a peaceful private retreat where elegant design meets the beauty of nature. Enjoy a relaxing escape with family and friends in the serene surroundings of Pililla, Rizal.",
        location: "📍 Pililla Rizal, Philippines",
        theme: "spanish-theme",
        exploreUrl: "spanish.html"
    }
};

let activeVilla = "tuscan";
let changingTimeout;

const villaSection = document.querySelector(".villa-section");
const villaGallery = document.getElementById("villaGallery");
const villaBackground = document.getElementById("villaBackground");
const villaCopy = document.getElementById("villaCopy");

const villaLocation = document.getElementById("villaLocation");
const villaTitle = document.getElementById("villaTitle");
const villaDescription = document.getElementById("villaDescription");
const exploreButton = document.querySelector(".explore-button");
const footerReviewsLink = document.getElementById("footerReviewsLink");

const largeCard = document.getElementById("largeCard");
const smallCard = document.getElementById("smallCard");

function renderVilla(name) {
    const villa = villaData[name];

    activeVilla = name;

    // Update the main background and its gradient theme.
    villaBackground.src = villa.image;
    villaBackground.alt = villa.name;

    villaSection.classList.remove("tuscan-theme", "spanish-theme");
    villaSection.classList.add(villa.theme);

    // Update the title, location, and description.
    villaLocation.textContent = villa.location;
    villaTitle.innerHTML = villa.title;
    villaDescription.textContent = villa.description;
    exploreButton.href = villa.exploreUrl;
    footerReviewsLink.href = villa.exploreUrl + "#reviews";
    footerReviewsLink.textContent = "Read " + villa.name + " reviews";
}

function switchVilla(name) {
    if (name === activeVilla) return;

    // Fade the copy and background slightly during the change.
    villaSection.classList.add("changing");

    // Keep each card linked to its villa and set the layout for the selection.
    villaGallery.classList.toggle("swapping", name === "spanish");

    // Update the villa details shown in the showcase.
    renderVilla(name);

    window.clearTimeout(changingTimeout);
    changingTimeout = window.setTimeout(() => {
        villaSection.classList.remove("changing");
    }, 780);
}

largeCard.addEventListener("click", () => switchVilla("spanish"));
smallCard.addEventListener("click", () => switchVilla("tuscan"));

function showNotice(message) {
    alert(message);
    return false;
}