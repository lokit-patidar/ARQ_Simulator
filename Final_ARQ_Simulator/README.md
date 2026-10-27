# ARQ Protocol Simulator

A website that simulates **Stop-and-Wait**, **Go-Back-N** and **Selective Repeat**
(Data Link Layer flow control) frame by frame.
The simulation logic is a direct translation of the C++ program.

Built with React, Tailwind CSS and Vite.
No Node/Express server is needed: everything runs in the browser.

## How to run

You need Node.js (version 18 or newer) from https://nodejs.org

    npm install
    npm run dev

Then open the address shown in the terminal (usually http://localhost:5173).

## Other commands

    npm run build      # makes the final website in the "dist" folder
    npm run preview    # opens the built website to test it

## Folder guide

    index.html                 the single HTML page
    src/main.jsx               starts React
    src/App.jsx                main page: keeps the state, runs the animation
    src/simulator.js           THE C++ LOGIC, translated to JavaScript
    src/formHelpers.js         input checks (same rules as the C++ program)
    src/index.css              Tailwind + colours + fonts
    src/components/
        ConfigPanel.jsx        left panel with all inputs
        Controls.jsx           play, pause, step, speed, time slider
        Channel.jsx            animated frames and ACKs travelling
        Windows.jsx            sender and receiver window boxes
        TimeSpace.jsx          time-space diagram
        LogPanel.jsx           transmission log (copy / download)
        Stats.jsx              performance summary
        Compare.jsx            all three protocols side by side

## Notes

- The C++ program accepts up to 100000 frames. The website limits it to 200
  so that every frame can be drawn and the page stays fast.
- Output was checked against the compiled C++ program on 600+ random
  configurations. The log and the summary were identical.
