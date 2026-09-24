/* ==================================================
   POPULARIS WIKI — structured data
   Drives infoboxes, wiki-links, related pages,
   categories and the "recently updated" feed.
   Pure data + tiny helpers, no DOM here.
================================================== */

window.WIKI = (function () {

    /* --------------------------------------------------
       category tree (order matters for the drawer)
    -------------------------------------------------- */
    const CATEGORIES = [
        {
            id: "overview", label: "Overview", icon: "&#9733;",
            pages: ["about", "seasons", "players"]
        },
        {
            id: "seasons", label: "Seasons", icon: "&#10052;",
            pages: ["season1", "season2", "season3"]
        },
        {
            id: "world", label: "World", icon: "&#127758;",
            pages: ["lore", "locations", "items", "abilities"]
        },
        {
            id: "players", label: "Players", icon: "&#128101;",
            pages: [
                "people-adam", "people-callan", "people-danny", "people-feidhlim",
                "people-felix", "people-greer", "people-harrison", "people-jackson",
                "people-jame", "people-johan", "people-liam", "people-lochy",
                "people-mark", "people-max", "people-ruben", "people-robert",
                "people-sam", "people-placeholder"
            ]
        },
        {
            id: "meta", label: "Meta", icon: "&#9881;",
            pages: ["settings", "credits"]
        }
    ];

    /* --------------------------------------------------
       per-page: last updated + related pages
       (dates are ISO; "recently updated" sorts by these)
    -------------------------------------------------- */
    const PAGES = {
        about:     { updated: "2026-07-01", related: ["seasons", "players", "lore"] },
        seasons:   { updated: "2026-06-30", related: ["season2", "season1", "lore"] },
        players:   { updated: "2026-06-30", related: ["abilities", "seasons"] },
        lore:      { updated: "2026-06-24", related: ["seasons", "locations", "items"],
            gallery: [
                { src: "images/explore_lore.jpg",      cap: "The world before the Sundering" },
                { src: "images/explore_seasons.jpg",   cap: "Two islands, one broken continent" }
            ]
        },
        abilities: { updated: "2026-06-22", related: ["players", "items", "lore"] },
        locations: { updated: "2026-06-18", related: ["lore", "season2"],
            gallery: [
                { src: "images/explore_locations.jpg", cap: "Points of interest across the islands" },
                { src: "images/explore_seasons.jpg",   cap: "The Great Divide" }
            ]
        },
        items:     { updated: "2026-06-20", related: ["abilities", "lore", "locations"] },
        season1:   { updated: "2026-05-30", related: ["seasons", "season2", "lore"],
            gallery: [
                { src: "images/explore_season1.jpg",   cap: "Season 1 — The Origin" },
                { src: "images/explore_seasons.jpg",   cap: "The early archipelago" }
            ]
        },
        season2:   { updated: "2026-06-28", related: ["seasons", "season1", "abilities", "locations"],
            gallery: [
                { src: "images/explore_season2.jpg",   cap: "The volcanic and jungle islands" },
                { src: "images/explore_locations.jpg", cap: "Points of interest" },
                { src: "images/explore_players.jpg",   cap: "The two teams" },
                { src: "images/explore_abilities.jpg", cap: "Ability trials" }
            ]
        },
        season3:   { updated: "2026-06-10", related: ["seasons", "season2"],
            gallery: [
                { src: "images/explore_season3.jpg",   cap: "Season 3 — In development" },
                { src: "images/explore_seasons.jpg",   cap: "A new era of Popularis" }
            ]
        },
        settings:  { updated: "2026-07-02", related: ["about"] },
        credits:   { updated: "2026-07-06", related: ["about", "players"] }
    };

    /* --------------------------------------------------
       player infobox data
       team: "volcanic" | "jungle" | "" (unaffiliated)
    -------------------------------------------------- */
    const PLAYERS = {
        "people-adam":      { name: "Adam",     team: "volcanic", ability: "Unrevealed",        foundAt: "Spawn",             season: "Season 2", status: "Active" },
        "people-callan":    { name: "Callan",   team: "volcanic", ability: "Auto-aim Bows",     foundAt: "Magma Forge",       season: "Season 2", status: "Active" },
        "people-danny":     { name: "Danny",    team: "jungle",   ability: "Towers & Golems",   foundAt: "Ancient Dockyard",  season: "Season 2", status: "Active" },
        "people-feidhlim":  { name: "Feidhlim", team: "",         ability: "Unknown",           foundAt: "—",            season: "—",   status: "Active" },
        "people-felix":     { name: "Felix",    team: "jungle",   ability: "Revenant Origin",   foundAt: "Scorched Hollow",   season: "Season 2", status: "Active" },
        "people-greer":     { name: "Greer",    team: "jungle",   ability: "Haroldthebutler",   foundAt: "Blooming Canyon",   season: "Season 2", status: "Active" },
        "people-harrison":  { name: "Harrison", team: "jungle",   ability: "Cleric",            foundAt: "Sunken Archway",    season: "Season 2", status: "Active" },
        "people-jackson":   { name: "Jackson",  team: "",         ability: "Unknown",           foundAt: "—",            season: "—",   status: "Awaiting Form" },
        "people-jame":      { name: "Jame",     team: "volcanic", ability: "Spotter's Mark",    foundAt: "Spawn",             season: "Season 2", status: "Active" },
        "people-johan":     { name: "Johan",    team: "jungle",   ability: "Mage (Spell Engine)", foundAt: "Spawn",           season: "Season 2", status: "Active" },
        "people-liam":      { name: "Liam",     team: "volcanic", ability: "Invincibility",     foundAt: "Scorched Village",  season: "Season 2", status: "Active" },
        "people-lochy":     { name: "Lochy",    team: "",         ability: "Unknown",           foundAt: "—",            season: "—",   status: "Active" },
        "people-mark":      { name: "Mark",     team: "volcanic", ability: "Ability Steal",     foundAt: "Obsidian Spine",    season: "Season 2", status: "Active" },
        "people-max":       { name: "Max",      team: "volcanic", ability: "Flight (Icarus)",   foundAt: "Ironclad Shipwreck", season: "Season 2", status: "Active" },
        "people-ruben":     { name: "Reuben",   team: "jungle",   ability: "Unrevealed",        foundAt: "Pirate's Cove",     season: "Season 2", status: "Active" },
        "people-robert":    { name: "Robert",   team: "",         ability: "Unknown",           foundAt: "—",            season: "—",   status: "Active" },
        "people-sam":       { name: "Sam",      team: "jungle",   ability: "Flame Sword",       foundAt: "Scorched Hollow",   season: "Season 2", status: "Active" },
        "people-placeholder": { name: "???",    team: "",         ability: "Unknown",           foundAt: "—",            season: "—",   status: "Coming Soon" }
    };

    /* --------------------------------------------------
       wiki-link vocabulary: phrase -> target page.
       Matched longest-first, first occurrence per page.
    -------------------------------------------------- */
    const LINKS = {
        // lore
        "Ignivar's Gauntlet": "items",
        "Ignivar": "lore",
        "Verdantis": "lore",
        "the Sundering": "lore",
        "Sundering": "lore",
        "Great Divide": "lore",
        "Titans": "lore",
        "Titan": "lore",
        // seasons
        "Season 1": "season1",
        "Season 2": "season2",
        "Season 3": "season3",
        // items
        "Flame Sword": "items",
        "Bloodmoon Bow": "items",
        "Wings of the Ironclad": "items",
        "Dwarven Core": "items",
        "Jungle Heart": "items",
        // locations
        "Magma Forge": "locations",
        "Obsidian Spine": "locations",
        "Ashen Colosseum": "locations",
        "Emberfall Caverns": "locations",
        "Scorched Village": "locations",
        "Dragon's Maw": "locations",
        "Ironclad Shipwreck": "locations",
        "Scorched Hollow": "locations",
        "Whispering Waterfall": "locations",
        "Ancient Dockyard": "locations",
        "Blooming Canyon": "locations",
        "Sunken Archway": "locations",
        // players (first names -> their page)
        "Harrison": "people-harrison",
        "Reuben": "people-ruben",
        "Callan": "people-callan",
        "Johan": "people-johan",
        "Felix": "people-felix",
        "Danny": "people-danny",
        "Greer": "people-greer",
        "Liam": "people-liam",
        "Adam": "people-adam",
        "Jame": "people-jame",
        "Mark": "people-mark",
        "Max": "people-max",
        "Sam": "people-sam"
    };

    /* --------------------------------------------------
       references / sources
       (distinct from "related pages" — these read like
       citations. page => internal link, href => external)
    -------------------------------------------------- */
    const DEFAULT_REFERENCES = [
        { label: "Volcanic Lore Books I–V", page: "lore",      note: "In-world primary source" },
        { label: "Interactive World Map",   page: "locations", note: "BlueMap render of the islands" },
        { label: "Season 2 — event structure", page: "season2", note: "Phases, teams and rules" }
    ];

    const REFERENCES = {
        about:     [{ label: "Seasons overview", page: "seasons", note: "Every chapter of Popularis" }],
        seasons:   [{ label: "World Lore", page: "lore", note: "Why the islands exist" }],
        players:   [{ label: "Player abilities", page: "abilities", note: "Powers & origins" }],
        abilities: [{ label: "Ability trial locations", page: "locations", note: "Where powers are found" },
                    { label: "Legendary Items", page: "items", note: "Relic-bound powers" }],
        items:     [{ label: "Ignivar's Gauntlet questline", page: "lore", note: "The three-riddle chain" }],
        locations: [{ label: "World Lore & Timeline", page: "lore", note: "The Sundering's scars" }],
        lore:      [{ label: "Legendary Items", page: "items", note: "Titan-forged relics" }],
        season1:   [{ label: "Season 2", page: "season2", note: "The sequel event" }],
        season2:   [{ label: "World Lore", page: "lore", note: "Titan backstory" }],
        season3:   [{ label: "Season 2", page: "season2", note: "The preceding event" }]
    };

    function refsFor(page) {
        const specific = REFERENCES[page] || [];
        const seen = {};
        const out = [];
        specific.concat(DEFAULT_REFERENCES).forEach(r => {
            if (r.page && r.page === page) return;                 // no self-reference
            const key = r.page ? "p:" + r.page : "h:" + (r.href || r.label);
            if (seen[key]) return;
            seen[key] = 1;
            out.push(r);
        });
        return out;
    }

    /* --------------------------------------------------
       helpers
    -------------------------------------------------- */
    function label(page) {
        if (typeof getPageLabel === "function") return getPageLabel(page);
        return page;
    }

    function recentlyUpdated(limit) {
        return Object.keys(PAGES)
            .map(id => ({ id, updated: PAGES[id].updated }))
            .sort((a, b) => (a.updated < b.updated ? 1 : -1))
            .slice(0, limit || 6);
    }

    function categoryOf(page) {
        const cat = CATEGORIES.find(c => c.pages.includes(page));
        return cat ? cat.label : null;
    }

    /* --------------------------------------------------
       Volcanic Lore Books — content for the book reader
    -------------------------------------------------- */
    const LORE_BOOKS = [
        {
            id: 1, numeral: "I", title: "The Night the Sky Split",
            pages: [
                "In the year the stars wept, a vessel of black iron fell burning from the heavens. It carved a wound across the volcanic coast that has never truly healed.",
                "Where it struck, the ground drank fire. A corruption spread outward like frost creeping across a cold window — silent, patient, and unstoppable.",
                "The elders say Ignivar felt the impact in his sleep, and that his dreams have been troubled ever since. Some fires, once lit, refuse to be forgotten."
            ]
        },
        {
            id: 2, numeral: "II", title: "The Ironclad Invasion",
            pages: [
                "From the shattered hull came the Emberborn — armoured, tireless, and hungry for one thing above all: Ignivar's Gauntlet, the hand that once shaped the mountains.",
                "They built no homes. They planted no fields. They only dug, and marched, and searched, leaving scorched banners wherever the Gauntlet's echo grew strong.",
                "Those who resisted were broken. Those who fled carried the warning inland, and the warning became a fear, and the fear became a wall."
            ]
        },
        {
            id: 3, numeral: "III", title: "The Mangled Ones",
            pages: [
                "Not all who breathed Ignivar's wounded breath died. Some were changed — bent into shapes that should not walk, yet walk they do, along the ashen ridges at night.",
                "They remember names they no longer own. They reach for a warmth that burns them. Pity them if you can; survive them if you cannot."
            ]
        },
        {
            id: 4, numeral: "IV", title: "The Dwarven Refuge",
            pages: [
                "Beneath the Magma Forge, the first dwarves cut deep and learned what the surface had forgotten: the Gauntlet was never a weapon. It was a key.",
                "They sealed their halls, hoarded the truth, and swore an oath in molten stone — that the Maw would never again be opened by hands that did not understand it.",
                "In time the oath outlived its keepers. The halls fell quiet. The key waited, as keys do."
            ]
        },
        {
            id: 5, numeral: "V", title: "The Maw and the Hand",
            pages: [
                "At the heart of the mountain lies the Maw — a reactor of Titan-fire, sealed by three locks and three riddles, each guarded by a trial only the worthy survive.",
                "The first riddle sleeps upon the Obsidian Spine. The second waits in the dark of Emberfall Caverns. The third lies drowned beneath the Ironclad wreck.",
                "Solve all three, and the Ashen Colosseum opens. Claim the Gauntlet there, and you hold the hand that broke the world — and perhaps the hand that could mend it."
            ]
        }
    ];

    return { CATEGORIES, PAGES, PLAYERS, LINKS, LORE_BOOKS, label, recentlyUpdated, categoryOf, refsFor };
})();
