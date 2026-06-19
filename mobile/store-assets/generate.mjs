import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const GREEN = '#2E7D32';
const GREEN_D = '#1B5E20';
const GREEN_L = '#66BB6A';
const BG = '#F1F8E9';

// ---------- App icon (512x512) ----------
const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_L}"/><stop offset="1" stop-color="${GREEN_D}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <!-- furrows -->
  <g stroke="#ffffff" stroke-opacity="0.25" stroke-width="10" fill="none">
    <path d="M70 370 Q256 330 442 370"/>
    <path d="M70 410 Q256 370 442 410"/>
    <path d="M70 450 Q256 410 442 450"/>
  </g>
  <!-- leaf -->
  <path d="M256 90 C150 150 150 300 256 360 C362 300 362 150 256 90 Z" fill="#ffffff"/>
  <path d="M256 110 L256 350" stroke="${GREEN}" stroke-width="14" stroke-linecap="round"/>
  <g stroke="${GREEN}" stroke-width="10" stroke-linecap="round">
    <path d="M256 170 L210 150"/><path d="M256 170 L302 150"/>
    <path d="M256 230 L196 205"/><path d="M256 230 L316 205"/>
    <path d="M256 290 L206 268"/><path d="M256 290 L306 268"/>
  </g>
</svg>`;

// ---------- Feature graphic (1024x500) ----------
const feature = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_D}"/><stop offset="1" stop-color="${GREEN}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <g stroke="#ffffff" stroke-opacity="0.12" stroke-width="14" fill="none">
    <path d="M0 430 Q512 380 1024 430"/><path d="M0 470 Q512 420 1024 470"/>
  </g>
  <!-- mini leaf mark -->
  <g transform="translate(120,170)">
    <circle r="92" fill="#ffffff" fill-opacity="0.12"/>
    <path d="M0 -70 C-62 -30 -62 50 0 86 C62 50 62 -30 0 -70 Z" fill="#ffffff"/>
    <path d="M0 -54 L0 78" stroke="${GREEN}" stroke-width="9" stroke-linecap="round"/>
  </g>
  <text x="250" y="205" font-family="Segoe UI, Arial, sans-serif" font-size="92" font-weight="800" fill="#ffffff">Kadir AI</text>
  <text x="252" y="262" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#E8F5E9">Your farm's AI assistant · கதிர்</text>
  <text x="252" y="318" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="#C8E6C9">Advisory • Crop advice • Risk &amp; Credit • English/Hindi/Tamil</text>
</svg>`;

// ---------- Phone screenshot builder (1080x1920) ----------
function phone({ caption, screen }) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="${GREEN_D}"/>
  <text x="540" y="120" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800" fill="#ffffff">${caption}</text>
  <!-- device frame -->
  <rect x="120" y="200" width="840" height="1560" rx="60" fill="#ffffff"/>
  <rect x="120" y="200" width="840" height="120" rx="60" fill="${GREEN}"/>
  <rect x="120" y="260" width="840" height="60" fill="${GREEN}"/>
  <text x="170" y="278" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">Kadir AI</text>
  ${screen}
</svg>`;
}

const sHome = `
  <text x="170" y="420" font-family="Segoe UI, Arial" font-size="46" font-weight="700" fill="#1b1b1b">My Farm</text>
  ${[0,1,2].map((i)=>`
  <g transform="translate(170,${480+i*150})">
    <rect width="740" height="120" rx="18" fill="${BG}" stroke="#C8E6C9"/>
    <rect x="24" y="34" width="52" height="52" rx="10" fill="${GREEN_L}"/>
    <text x="100" y="56" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="#1b1b1b">FP-2026-${['A91C','7F32','D5E8'][i]}</text>
    <text x="100" y="96" font-family="Segoe UI, Arial" font-size="28" fill="#555">Area: ${['4.8','2.1','6.3'][i]} ha</text>
  </g>`).join('')}
  <rect x="600" y="1640" width="310" height="90" rx="45" fill="${GREEN}"/>
  <text x="755" y="1697" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="#fff">+ Add Field</text>`;

const sScores = `
  <text x="170" y="420" font-family="Segoe UI, Arial" font-size="46" font-weight="700" fill="#1b1b1b">Risk &amp; Credit</text>
  <g transform="translate(170,470)">
    <text font-family="Segoe UI, Arial" font-size="32" fill="#1b1b1b">Credit Score: 68 (B)</text>
    <rect y="20" width="740" height="28" rx="14" fill="#e0e0e0"/><rect y="20" width="503" height="28" rx="14" fill="${GREEN}"/>
    <text y="110" font-family="Segoe UI, Arial" font-size="32" fill="#1b1b1b">Farm Risk: 29</text>
    <rect y="130" width="740" height="28" rx="14" fill="#e0e0e0"/><rect y="130" width="215" height="28" rx="14" fill="#E53935"/>
  </g>
  <g transform="translate(170,720)">
    <rect width="740" height="320" rx="18" fill="#FFF3E0" stroke="#FFCC80"/>
    <text x="30" y="60" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="#E65100">Rs 2,35,000 at risk</text>
    <text x="30" y="130" font-family="Segoe UI, Arial" font-size="30" fill="#1b1b1b">⚠ Heavy rain expected (110 mm)</text>
    <text x="30" y="175" font-family="Segoe UI, Arial" font-size="26" fill="#555">Hold spraying; drain field; harvest if</text>
    <text x="30" y="208" font-family="Segoe UI, Arial" font-size="26" fill="#555">crop is mature.</text>
    <text x="30" y="265" font-family="Segoe UI, Arial" font-size="30" fill="#1b1b1b">⚠ Heat stress risk (40°C)</text>
  </g>`;

const sReco = `
  <text x="170" y="420" font-family="Segoe UI, Arial" font-size="46" font-weight="700" fill="#1b1b1b">Crop Advice</text>
  ${[['Tomato','3,70,000','60'],['Onion','3,10,000','55'],['Chilli','2,00,000','62'],['Groundnut','1,08,000','38']].map((c,i)=>`
  <g transform="translate(170,${480+i*150})">
    <rect width="740" height="120" rx="18" fill="${BG}" stroke="#C8E6C9"/>
    <circle cx="56" cy="60" r="26" fill="${GREEN_L}"/>
    <text x="100" y="54" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="#1b1b1b">${c[0]}</text>
    <text x="100" y="96" font-family="Segoe UI, Arial" font-size="26" fill="#555">Profit/ha Rs ${c[1]} • risk ${c[2]}</text>
  </g>`).join('')}`;

const shots = [
  { name: 'phone-1-home', caption: 'All your fields in one place', screen: sHome },
  { name: 'phone-2-scores', caption: 'Risk, credit &amp; money at risk', screen: sScores },
  { name: 'phone-3-crop', caption: 'The right crop for your field', screen: sReco },
];

// ---------- render ----------
const out = (name, svg, w, h) =>
  sharp(Buffer.from(svg)).resize(w, h).png().toFile(`${name}.png`).then(() => console.log('  +', `${name}.png`, `${w}x${h}`));

await out('app-icon-512', icon, 512, 512);
await out('feature-graphic-1024x500', feature, 1024, 500);
for (const s of shots) await out(s.name, phone(s), 1080, 1920);
// Tablet variants (Play 7"/10"/Chromebook accept these portrait shots too)
await out('tablet-1-home', phone(shots[0]), 1600, 2560);
await out('tablet-2-scores', phone(shots[1]), 1600, 2560);
console.log('done');
