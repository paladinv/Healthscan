// Generates icon-192.png and icon-512.png from an SVG drawn on a canvas
// Run once with: node generate_icons.js
// Requires: npm install canvas (or just use the pre-drawn SVG icons below)

// We'll output two simple SVG files instead — browsers accept SVG in manifest too,
// but for maximum compat we also provide a note about converting them.

const fs = require("fs");

const svgTemplate = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size*0.18}" fill="#0f172a"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.38}" stroke="#22c55e" stroke-width="${size*0.035}" fill="none" stroke-dasharray="${size*0.83} ${size*2.08}" stroke-linecap="round" transform="rotate(-30 ${size/2} ${size/2})"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.26}" fill="#1e293b"/>
  <path d="M${size*0.39} ${size/2} L${size*0.46} ${size*0.57} L${size*0.61} ${size*0.42}" stroke="#22c55e" stroke-width="${size*0.055}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

fs.writeFileSync("public/icon-192.svg", svgTemplate(192));
fs.writeFileSync("public/icon-512.svg", svgTemplate(512));
console.log("✓ Generated public/icon-192.svg and public/icon-512.svg");
