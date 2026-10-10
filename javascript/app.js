/* Original rendering and styling flow, adapted to server data. */
let subjects=[{"code":"PPM","name":"Principles of Management","description":"Management concepts, functions, principles and organisational basics.","color":"#f6d84a"},{"code":"BC","name":"Business Communication","description":"Communication skills, business writing, presentations and workplace communication.","color":"#9b7cff"},{"code":"FA","name":"Financial Accounting","description":"Accounting concepts, journal entries, ledgers, cash books and financial statements.","color":"#7ee787"},{"code":"BSL","name":"Business Statistics and Logic","description":"Statistics, central tendency, dispersion, probability and logical reasoning.","color":"#67c7ff"},{"code":"FE","name":"Functional English","description":"Grammar, vocabulary, sentence transformation and practical English communication.","color":"#ff75b5"},{"code":"IKS","name":"Indian Knowledge System","description":"Indian traditions, knowledge systems, philosophy, science and cultural heritage.","color":"#ff9f68"},{"code":"EM","name":"Environmental Management","description":"Environment, sustainability, pollution, resources and environmental responsibility.","color":"#7ee787"}];
let resources={};
const resourceTypes={"assignments":{"title":"Assignments","icon":"📝","description":"Class assignments and coursework."},"notes":{"title":"Notes","icon":"📚","description":"Lecture notes and revision material."},"questions":{"title":"Sample Questions","icon":"❓","description":"Questions for quiz and exam practice."}};
function createSubjectCard(subject) {

            return `
                <article
                    class="subject-card"
                    style="--accent:${subject.color}"
                    onclick="openSubject('${escapeHTML(subject.code)}')"
                >

                    <span class="subject-code">
                        ${subject.code}
                    </span>

                    <h3>
                        ${escapeHTML(subject.name)}
                    </h3>

                    <p>
                        ${escapeHTML(subject.description)}
                    </p>

                    <div class="subject-bottom">

                        <span class="resource-count">
                            3 resource sections
                        </span>

                        <span class="open-arrow">
                            →
                        </span>

                    </div>

                </article>
            `;

        }


        /* =========================================================
           LOAD SUBJECTS
        ========================================================= */

        function renderSubjects() {

            const home = document.getElementById("homeSubjects");
            const all = document.getElementById("allSubjects");

            home.innerHTML = subjects
                .slice(0, 6)
                .map(createSubjectCard)
                .join("");

            all.innerHTML = subjects
                .map(createSubjectCard)
                .join("");

        }


        /* =========================================================
           PAGE NAVIGATION
        ========================================================= */

function showPage(pageId) { if(appState.currentPage === 'reader' && pageId !== 'reader') releaseReader(); appState.currentPage=pageId; if(pageId==='subjects') {renderSubjects();if(appState.user&&!subjects.length)document.getElementById('allSubjects').innerHTML='<div class="empty"><h3>Coming soon.</h3><p>Notes for your selected year will appear here when added.</p></div>';}

            document
                .querySelectorAll(".page")
                .forEach(page => {
                    page.classList.remove("active");
                });

            const page = document.getElementById(pageId);

            if (page) {
                page.classList.add("active");
            }

            document
                .querySelectorAll(".nav-link")
                .forEach(link => {

                    link.classList.toggle(
                        "active",
                        link.dataset.page === pageId
                    );

                });

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

            closeMobileMenu();

        }


        /* =========================================================
           OPEN SUBJECT
        ========================================================= */

        function openSubject(code) { if (!appState.user) {openLogin(); return;}

            const subject = subjects.find(
                item => item.code === code
            );

            if (!subject) return;

            const content =
                document.getElementById("subjectDetailContent");

            content.innerHTML = `

                <span
                    class="subject-hero-code"
                    style="background:${subject.color}"
                >
                    ${subject.code}
                </span>

                <h1>
                    ${subject.name}
                </h1>

                <p>
                    ${subject.description}
                </p>

                <div class="resource-grid" style="margin-top:45px">

                    ${createResourceCard(
                        code,
                        "assignments"
                    )}

                    ${createResourceCard(
                        code,
                        "notes"
                    )}

                    ${createResourceCard(
                        code,
                        "questions"
                    )}

                </div>
            `;

            showPage("subjectDetail");

        }


        /* =========================================================
           CREATE RESOURCE CARD
        ========================================================= */

        function createResourceCard(
            subjectCode,
            resourceType
        ) {

            const resource = resourceTypes[resourceType];

            return `

                <article
                    class="resource-card"
                    onclick="openResource(
                        '${subjectCode}',
                        '${resourceType}'
                    )"
                >

                    <div class="resource-icon">
                        ${resource.icon}
                    </div>

                    <h3>
                        ${resource.title}
                    </h3>

                    <p>
                        ${resource.description}
                    </p>

                    <span class="resource-arrow">
                        Open ${resource.title} →
                    </span>

                </article>

            `;

        }


        /* =========================================================
           OPEN RESOURCE
        ========================================================= */

        function openResource(subjectCode, resourceType) { if (!appState.user) {openLogin(); return;} appState.resourceSubject=subjectCode;appState.resourceType=resourceType;

            const subject = subjects.find(
                item => item.code === subjectCode
            );

            const resource = resourceTypes[resourceType];

            if (!subject || !resource) return;

            const content =
                document.getElementById(
                    "resourceDetailContent"
                );

            const files =
                resources[subjectCode]?.[resourceType] || [];

            let filesHTML = "";

            if (files.length === 0) {

                filesHTML = `

                    <div class="empty">

                        <div class="empty-icon">
                            ${resource.icon}
                        </div>

                        <h3>
                            No files uploaded yet.
                        </h3>

                        <p style="margin-top:10px">
                            ${resource.title} for
                            ${subject.name} will appear here
                            when PDFs are added.
                        </p>

                    </div>

                `;

            } else {

                filesHTML = `

                    <div class="pdf-list">

                        ${files.map(file => `

                            <div class="pdf-item">

                                <div class="pdf-info">

                                    <div class="pdf-icon">
                                        PDF
                                    </div>

                                    <div>
                                        <strong>
                                            ${escapeHTML(file.name)}
                                        </strong>

                                        <small>
                                            ${escapeHTML(file.description || "Study material")}
                                        </small>
                                    </div>

                                </div>

                                <div class="pdf-actions">
                                    <button class="small-btn" onclick="openReader(${file.id})">Read notes</button>
                                </div>

                            </div>

                        `).join("")}

                    </div>

                `;

            }

            content.innerHTML = `

                <div class="breadcrumb">
                    ${subject.code}
                    /
                    ${resource.title}
                </div>

                <h1>
                    ${resource.icon}
                    ${resource.title}
                </h1>

                <p style="
                    color:var(--muted);
                    margin-top:15px;
                    max-width:650px;
                    line-height:1.6;
                ">
                    ${subject.name}
                    —
                    ${resource.description}
                </p>

                <div style="margin-top:40px">
                    ${filesHTML}
                </div>

            `;

            document.getElementById(
                "resourceBackButton"
            ).onclick = () => openSubject(subjectCode);

            showPage("resourceDetail");

        }


        /* =========================================================
           SEARCH
        ========================================================= */

        function performSearch() {

            const query =
                document
                    .getElementById("searchInput")
                    .value
                    .trim()
                    .toLowerCase();

            const container =
                document.getElementById("searchResults");

            if (!query) {

                container.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">🔎</div>
                        <p>
                            Start typing to search subjects
                            and resources.
                        </p>
                    </div>
                `;

                return;
            }

            const results = [];

            subjects.forEach(subject => {

                const subjectMatch =
                    subject.code.toLowerCase().includes(query) ||
                    subject.name.toLowerCase().includes(query) ||
                    subject.description.toLowerCase().includes(query);

                if (subjectMatch) {

                    results.push({
                        type: "Subject",
                        title: `${subject.code} — ${subject.name}`,
                        action: () => openSubject(subject.code)
                    });

                }

                Object.entries(resourceTypes).forEach(
                    ([key, resource]) => {

                        if (
                            resource.title.toLowerCase().includes(query) ||
                            resource.description.toLowerCase().includes(query)
                        ) {

                            results.push({
                                type: subject.code,
                                title: `${subject.code} — ${resource.title}`,
                                action: () => openResource(
                                    subject.code,
                                    key
                                )
                            });

                        }

                    }
                );

            });


            if (results.length === 0) {

                container.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">💀</div>
                        <h3>No results.</h3>
                        <p style="margin-top:8px">
                            Try “PPM”, “accounting”,
                            “notes” or “statistics”.
                        </p>
                    </div>
                `;

                return;
            }


            container.innerHTML = `
                <div class="search-results">
                    ${results.map(
                        (result, index) => `
                            <div
                                class="search-result"
                                onclick="searchOpen(${index})"
                            >
                                <div>
                                    <strong>
                                        ${escapeHTML(result.title)}
                                    </strong>
                                </div>

                                <small>
                                    ${result.type} →
                                </small>
                            </div>
                        `
                    ).join("")}
                </div>
            `;

            window.currentSearchResults = results;

        }


        function searchOpen(index) {

            if (
                window.currentSearchResults &&
                window.currentSearchResults[index]
            ) {

                window.currentSearchResults[index].action();

            }

        }


        /* =========================================================
           RESOURCE DIRECTORY FILTER
        ========================================================= */

        function browseResource(type) {

            showPage("subjects");

            setTimeout(() => {

                const resource = resourceTypes[type];

                const all =
                    document.getElementById("allSubjects");

                all.innerHTML = subjects
                    .map(subject => {

                        return `
                            <article
                                class="resource-card"
                                onclick="openResource(
                                    '${subject.code}',
                                    '${type}'
                                )"
                            >

                                <div class="resource-icon">
                                    ${resource.icon}
                                </div>

                                <h3>
                                    ${subject.code}
                                </h3>

                                <p>
                                    ${subject.name}
                                </p>

                                <span class="resource-arrow">
                                    ${resource.title} →
                                </span>

                            </article>
                        `;

                    })
                    .join("");

            }, 50);

        }


        /* =========================================================
           SURPRISE ME
        ========================================================= */

        function surpriseMe() {

            const randomIndex =
                Math.floor(
                    Math.random() * subjects.length
                );

            openSubject(
                subjects[randomIndex].code
            );

        }


        /* =========================================================
           QUOTES
        ========================================================= */

        const quotes = [

            "“Kal se pakka padhunga.”",

            "“Bro, notes bhej na.”",

            "“Attendance? What's that?”",

            "“One last question.”",

            "“Assignment kab submit karna hai?”",

            "“Lock in bro.”",

            "“Sir, network issue tha.”",

            "“Exam toh easy hi hoga.”"

        ];


        function newQuote() {

            const random =
                Math.floor(
                    Math.random() * quotes.length
                );

            document.getElementById(
                "quoteText"
            ).textContent = quotes[random];

        }


        /* =========================================================
           DARK / LIGHT MODE
        ========================================================= */

        function toggleTheme() {

            document.body.classList.toggle("light");

            const light =
                document.body.classList.contains("light");

            localStorage.setItem(
                "cb-theme",
                light ? "light" : "dark"
            );

        }


        function loadTheme() {

            const saved =
                localStorage.getItem("cb-theme");

            if (saved === "light") {

                document.body.classList.add("light");

            }

        }


        /* =========================================================
           LOGIN
        ========================================================= */

        function openLogin() { if(appState.user){renderAccount();showPage('account');return;} setAuthMode('login');

            document
                .getElementById("loginModal")
                .classList.add("open");

        }


        function closeLogin() {

            document
                .getElementById("loginModal")
                .classList.remove("open");

        }


        


        /* =========================================================
           MOBILE MENU
        ========================================================= */

        function toggleMobileMenu() {

            document
                .getElementById("navLinks")
                .classList.toggle("open");

        }


        function closeMobileMenu() {

            document
                .getElementById("navLinks")
                .classList.remove("open");

        }


        /* =========================================================
           COPY PDF LINK
        ========================================================= */

                /* =========================================================
           CLOSE MODAL WHEN CLICKING OUTSIDE
        ========================================================= */

        document
            .getElementById("loginModal")
            .addEventListener(
                "click",
                function(event) {

                    if (
                        event.target === this
                    ) {

                        closeLogin();

                    }

                }
            );


        /* =========================================================
           KEYBOARD SHORTCUT
        ========================================================= */

        document.addEventListener(
            "keydown",
            function(event) {

                if (
                    event.key === "/" &&
                    document.activeElement.tagName !== "INPUT"
                ) {

                    event.preventDefault();

                    showPage("search");

                    setTimeout(() => {

                        document
                            .getElementById("searchInput")
                            .focus();

                    }, 100);

                }

                if (event.key === "Escape") {

                    closeLogin();

                }

            }
        );


        /* =========================================================
           INITIALISE WEBSITE
        ========================================================= */



    
