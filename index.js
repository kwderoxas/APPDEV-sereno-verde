const villaData = {
    tuscan: {
        name: "Tuscan Villa",
        title: "TUSCAN<br>VILLA",
        image: "https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTQ5MTc1ODE4MzU5ODIxNjc0Mg%3D%3D/original/4c0d1f75-b0c3-4cf1-a338-981e53b9de10.jpeg?im_w=1920",
        description:
            "Escape the ordinary and enjoy a relaxing private-pool vacation at Tuscan Villa. Designed for comfort, privacy, and unforgettable moments, our villa is the perfect getaway for families, friends, and groups looking to unwind and enjoy quality time together.",
        location: "📍 Pililla Rizal, Philippines",
        theme: "tuscan-theme"
    },

    spanish: {
        name: "Spanish Villa",
        title: "SPANISH<br>VILLA",
        image: "https://a0.muscache.com/im/pictures/hosting/Hosting-1634789363443654990/original/1ce77356-5283-46db-985c-f9f1928f9e26.jpeg?im_w=1920",
        description:
            "Discover Spanish Villa, a peaceful private retreat where elegant design meets the beauty of nature. Enjoy a relaxing escape with family and friends in the serene surroundings of Pililla, Rizal.",
        location: "📍 Pililla Rizal, Philippines",
        theme: "spanish-theme"
    }
};

let activeVilla = "tuscan";
let isSwitching = false;

const villaSection = document.querySelector(".villa-section");
const villaGallery = document.getElementById("villaGallery");
const villaBackground = document.getElementById("villaBackground");
const villaCopy = document.getElementById("villaCopy");

const villaLocation = document.getElementById("villaLocation");
const villaTitle = document.getElementById("villaTitle");
const villaDescription = document.getElementById("villaDescription");

const largeCard = document.getElementById("largeCard");
const smallCard = document.getElementById("smallCard");

const largeCardImage = document.getElementById("largeCardImage");
const smallCardImage = document.getElementById("smallCardImage");

const largeCardTitle = document.getElementById("largeCardTitle");
const smallCardTitle = document.getElementById("smallCardTitle");

function renderVilla(name) {
    const villa = villaData[name];
    const otherName = name === "tuscan" ? "spanish" : "tuscan";
    const otherVilla = villaData[otherName];

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

    // The selected villa becomes the large card.
    largeCardImage.src = villa.image;
    largeCardImage.alt = villa.name;
    largeCardTitle.textContent = villa.name;

    // The other villa moves to the small card.
    smallCardImage.src = otherVilla.image;
    smallCardImage.alt = otherVilla.name;
    smallCardTitle.textContent = otherVilla.name;

    largeCard.setAttribute("aria-label", "Switch to " + otherVilla.name);
    smallCard.setAttribute("aria-label", "Switch to " + otherVilla.name);
}

function switchVilla() {
    if (isSwitching) return;

    isSwitching = true;

    const nextVilla = activeVilla === "tuscan" ? "spanish" : "tuscan";

    // Fade the copy and background slightly during the change.
    villaSection.classList.add("changing");

    // Swap card positions and sizes using CSS transitions.
    villaGallery.classList.toggle("swapping");

    // Update the background, gradient, text, and card images.
    renderVilla(nextVilla);

    window.setTimeout(() => {
        villaSection.classList.remove("changing");
        isSwitching = false;
    }, 780);
}

largeCard.addEventListener("click", switchVilla);
smallCard.addEventListener("click", switchVilla);

function showNotice(message) {
    alert(message);
    return false;
}