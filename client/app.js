const ws = new WebSocket("ws://localhost:3000");
const messages = document.getElementById("messages");

ws.onmessage = (event) => {
    addMessage(event.data, "other");
};

function sendMessage() {
    const input = document.getElementById("msg");

    if (input.value.trim() === "") return;

    ws.send(input.value);
    addMessage(input.value, "me");

    input.value = "";
}

function addMessage(text, type) {
    const div = document.createElement("div");
    div.classList.add("message", type);
    div.textContent = text;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}