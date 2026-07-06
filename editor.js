//this barely works lmao
let editing = false;

document.getElementById("editor-btn").addEventListener("click", () => {
    editing = !editing;

    const content = document.getElementById("content");

    if (editing) {
        content.contentEditable = "true";
        content.classList.add("editable");
        document.getElementById("editor-btn").innerText = "Save";
    } else {
        content.contentEditable = "false";
        content.classList.remove("editable");
        document.getElementById("editor-btn").innerText = "Editor";

        // Save to localStorage
        const page = content.dataset.page;
        localStorage.setItem("wiki_" + page, content.innerHTML);
    }
});
