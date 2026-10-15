const sampleReviews = {
    tuscan: [
        { name: "Mia R.", rating: 5, feedback: "A peaceful place to spend time with family. The pool was a highlight, and the villa felt welcoming from the moment we arrived." },
        { name: "Paolo D.", rating: 5, feedback: "We loved the relaxing atmosphere and the comfortable rooms. It was easy to slow down and enjoy the weekend." },
        { name: "Angela C.", rating: 4, feedback: "Great place for a group getaway. The outdoor spaces gave everyone room to relax and have fun." },
        { name: "Rafael M.", rating: 5, feedback: "The villa was clean and comfortable, and we especially enjoyed spending the afternoon by the pool." },
        { name: "Bea L.", rating: 4, feedback: "A lovely escape from the busy week. We enjoyed the views, the fresh air, and the cozy shared spaces." },
        { name: "Noah P.", rating: 5, feedback: "Perfect for a family gathering. There was plenty to do, and the whole stay felt calm and private." },
        { name: "Janelle S.", rating: 5, feedback: "We had a wonderful stay and made great memories together. I would happily recommend this villa." },
        { name: "Marco T.", rating: 4, feedback: "Comfortable rooms and a relaxing pool area. A great spot to catch up with friends for a few days." },
        { name: "Ella G.", rating: 5, feedback: "Everything felt inviting and peaceful. We especially enjoyed the evenings outside together." },
        { name: "Luis V.", rating: 5, feedback: "A memorable getaway with a beautiful setting and lots of space to relax. We hope to return soon." }
    ],
    spanish: [
        { name: "Clara B.", rating: 5, feedback: "The pool and terrace made our stay special. It was a peaceful and comfortable place for our family." },
        { name: "Andre F.", rating: 4, feedback: "We had a fun weekend with friends. The villa has welcoming spaces and a relaxing atmosphere." },
        { name: "Sofia N.", rating: 5, feedback: "A beautiful place to unwind. We loved the pool, the comfortable bedrooms, and the quiet surroundings." },
        { name: "Miguel A.", rating: 5, feedback: "The house worked wonderfully for our group. We enjoyed cooking together and relaxing outdoors." },
        { name: "Tina W.", rating: 4, feedback: "A refreshing change of pace. The terrace and hammock were our favorite spots to relax." },
        { name: "Joaquin R.", rating: 5, feedback: "We had a great family stay, with plenty of room and a lovely pool area to enjoy together." },
        { name: "Nina E.", rating: 5, feedback: "The villa felt comfortable and welcoming. We made the most of the pool and the games area." },
        { name: "Paolo C.", rating: 4, feedback: "A relaxing stay with friends. The bedrooms were comfortable and the kitchen made meals easy." },
        { name: "Grace M.", rating: 5, feedback: "So many ways to enjoy the day, from swimming to unwinding on the terrace. We would come back." },
        { name: "Ethan L.", rating: 5, feedback: "A memorable getaway in a peaceful setting. Our group had a wonderful time at Spanish Villa." }
    ]
};

function createReviewCard(review, isSample) {
    const card = document.createElement("article");
    card.className = "review-card";

    const header = document.createElement("div");
    header.className = "review-card-header";

    const guest = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = review.name;
    guest.append(name);

    if (isSample) {
        const label = document.createElement("span");
        label.className = "review-sample-label";
        label.textContent = "Sample review";
        guest.append(label);
    }

    const rating = document.createElement("span");
    rating.className = "review-rating";
    rating.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
    rating.setAttribute("aria-label", `${review.rating} out of 5 stars`);
    header.append(guest, rating);

    const feedback = document.createElement("p");
    feedback.textContent = review.feedback;
    card.append(header, feedback);
    return card;
}

function initializeReviews(section) {
    const villa = section.dataset.villaReviews;
    const sampleData = sampleReviews[villa];
    const summary = section.querySelector("[data-reviews-summary]");
    const list = section.querySelector("[data-reviews-list]");
    const form = section.querySelector("[data-review-form]");
    const message = section.querySelector("[data-review-message]");
    let savedReviews = [];

    function showMessage(text, isError) {
        message.textContent = text;
        message.dataset.error = isError ? "true" : "false";
    }

    function render() {
        const reviews = [...sampleData, ...savedReviews];
        const average = reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
        summary.textContent = `${average.toFixed(1)} out of 5 · ${reviews.length} ratings and reviews`;
        list.replaceChildren(...sampleData.map(review => createReviewCard(review, true)));
        list.append(...savedReviews.map(review => createReviewCard(review, false)));
    }

    render();

    fetch(`/api/feedback?villa=${encodeURIComponent(villa)}`)
        .then(async response => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Reviews could not be loaded.");
            savedReviews = Array.isArray(result.reviews) ? result.reviews : [];
            render();
        })
        .catch(error => showMessage(`Guest reviews could not be loaded: ${error.message}`, true));

    form.addEventListener("submit", event => {
        event.preventDefault();
        const formData = new FormData(form);
        const review = {
            name: String(formData.get("name")).trim(),
            email: String(formData.get("email")).trim(),
            rating: Number(formData.get("rating")),
            feedback: String(formData.get("feedback")).trim()
        };

        if (!review.name || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || !review.feedback) {
            showMessage("Please enter your name, choose a rating, and write your feedback.", true);
            return;
        }

        fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...review, villa })
        })
            .then(async response => {
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Your review could not be saved.");
                savedReviews.unshift({ ...review, villa });
                render();
                form.reset();
                showMessage("Thank you — your review has been saved.", false);
            })
            .catch(error => showMessage(`Your review could not be saved: ${error.message}`, true));
    });
}

document.querySelectorAll("[data-villa-reviews]").forEach(initializeReviews);
