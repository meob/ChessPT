$(document).ready(function() {
    const $achievementsTableBody = $('#achievementsTable tbody');
    const $clearAchievementsButton = $('#clearAchievementsButton');
    const $sortButtons = $('#achievementsTable th[data-sort]');

    let achievements = [];
    let currentSortColumn = 'date';
    let currentSortDirection = 'asc'; // 'asc' or 'desc'

    function loadAchievements() {
        const storedAchievements = localStorage.getItem('chessPTAchievements');
        if (storedAchievements) {
            achievements = JSON.parse(storedAchievements);
            achievements.forEach(a => {
                if (typeof a.date === 'string') {
                    let parsedDate = new Date(a.date);
                    if (!isNaN(parsedDate.getTime())) {
                        a.date = parsedDate; // Successfully parsed to Date object
                    } 
                    // If parsing fails (old toLocaleString format), keep it as string.
                    // It will be displayed as is, but won't sort correctly by date.
                }
            });
        }
    }

    function saveAchievements() {
        // Before saving, ensure all Date objects are converted to ISO strings
        const achievementsToSave = achievements.map(a => ({
            ...a,
            date: a.date instanceof Date ? a.date.toISOString() : a.date // Convert Date objects to ISO string
        }));
        localStorage.setItem('chessPTAchievements', JSON.stringify(achievementsToSave));
    }

    function sortAchievements(column) {
        if (currentSortColumn === column) {
            currentSortDirection = (currentSortDirection === 'asc') ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortDirection = 'asc';
        }

        // Update header indicators
        $sortButtons.removeClass('sort-active');
        $sortButtons.each(function() {
            let currentText = $(this).text().replace(/ [▲▼]/, '');
            $(this).text(currentText);
        });
        const indicator = currentSortDirection === 'asc' ? ' ▲' : ' ▼'; // ▲ or ▼
        const $currentHeader = $(`#achievementsTable th[data-sort="${currentSortColumn}"]`);
        $currentHeader.append(indicator);
        $currentHeader.addClass('sort-active');


        achievements.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            if (column === 'date') {
                // If it's a Date object, use getTime() for comparison
                // If it's still a string (old unparseable format), compare as string.
                valA = (valA instanceof Date) ? valA.getTime() : valA;
                valB = (valB instanceof Date) ? valB.getTime() : valB;
            }

            if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        renderAchievements();
    }

    function renderAchievements() {
        $achievementsTableBody.empty();
        if (achievements.length === 0) {
            $achievementsTableBody.append('<tr><td colspan="4">No achievements yet. Play some games!</td></tr>');
            return;
        }

        achievements.forEach((achievement, index) => {
            // Display Date objects as locale string, display strings as is
            const displayDate = achievement.date instanceof Date ? achievement.date.toLocaleString() : achievement.date;
            const row = `
                <tr>
                    <td>${displayDate}</td>
                    <td>${achievement.name}</td>
                    <td>${achievement.time}</td>
                    <td><button class="button-icon delete-btn" data-index="${index}" title="Delete Achievement">&#x1F5D1;</button></td>
                </tr>
            `;
            $achievementsTableBody.append(row);
        });
    }

    function deleteAchievement(index) {
        achievements.splice(index, 1);
        saveAchievements();
        renderAchievements();
    }

    // Event Listeners
    $sortButtons.on('click', function() {
        const column = $(this).data('sort');
        sortAchievements(column);
    });

    $achievementsTableBody.on('click', '.delete-btn', function() {
        const index = $(this).data('index');
        deleteAchievement(index);
    });

    $clearAchievementsButton.on('click', function() {
        if (confirm('Are you sure you want to clear all achievements?')) {
            achievements = [];
            saveAchievements();
            renderAchievements();
        }
    });

    $('#backToTrainingBtn').on('click', function() {
        window.location.href = 'index.html';
    });

    // Initial load and render
    loadAchievements();
    sortAchievements(currentSortColumn); // Sort by date desc by default
});
