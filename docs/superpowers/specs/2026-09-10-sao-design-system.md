# SAO Design System — Cockpit Specification

> Visual, typographic, and interactive design system for the Cardinal System Web Cockpit.
> Inspired by Sword Art Online (Aincrad / Gun Gale Online / Underworld System UI).
> Created: 2026-09-10.

---

## 1. Design Principles & Hierarchy

Cockpit and data interfaces require strong visual hierarchy to prevent eye fatigue while preserving high legibility.
The system implements the **60-30-10 Rule**:

- **60% Deep Foundations:** Obsidian deep space base (`#0A0B0E`) to avoid pure black OLED smear while providing infinite depth.
- **30% Structural Panels:** Graphite surfaces (`#12151D`, `#181C26`) with ultra-fine luminous borders (`1px solid rgba(255, 255, 255, 0.07)`).
- **10% Functional Accents:** Purpose-driven colors where each hue represents an operational state.

---

## 2. Color Palette & Functional Tokens

```
┌────────────────────────────────────────────────────────────────────────┐
│                              PALETTE MAP                               │
│                                                                        │
│   [#0A0B0E] Deep Obsidian (Canvas Background)                         │
│   [#12151D] Panel Graphite (Floating Surfaces)                        │
│   [#181C26] Panel Elevate (Hover & Modal Surfaces)                     │
│                                                                        │
│   [#FF7A00] Aincrad Orange   --> Primary Action / Active Player State │
│   [#00F0FF] Sinon Turquoise  --> Telemetry / Live Stream / Success    │
│   [#8A3FFC] Underworld Purple--> Cryptography / Identity / Scopes     │
│   [#FF2A4D] Slash Red        --> Errors / Cutoffs / Security Denials  │
│   [#EAECEF] Pure Text        --> Primary High-Contrast Labels         │
│   [#8C95A6] Muted Text       --> Secondary Metadata & Timestamps       │
└────────────────────────────────────────────────────────────────────────┘
```

### Color Tokens

| Token | Hex | Function & Context |
|---|---|---|
| `bg-obsidian` | `#0A0B0E` | Main dashboard viewport background. |
| `surface-graphite` | `#12151D` | Standard card and table background. |
| `surface-elevated` | `#181C26` | Modals, dropdown menus, hover rows. |
| `border-subtle` | `rgba(255, 255, 255, 0.07)` | Standard panel perimeter stroke. |
| `border-focus` | `rgba(255, 122, 0, 0.40)` | Active focus or selection ring. |
| `accent-aincrad` | `#FF7A00` | Primary action buttons, active navigation indicator, cursor focus. |
| `accent-aincrad-glow`| `rgba(255, 122, 0, 0.15)` | Background highlight for active cards. |
| `accent-sinon` | `#00F0FF` | Token consumption metrics, active routes, healthy provider pings. |
| `accent-sinon-glow` | `rgba(0, 240, 255, 0.12)` | Live telemetry status pills. |
| `accent-underworld`| `#8A3FFC` | API key badges, role designations, memory security scopes. |
| `accent-slash-red` | `#FF2A4D` | Execution failures, rate limit breaches, 403 ACL denials, damage cuts. |
| `text-primary` | `#EAECEF` | Main content, headers, readable text (WCAG AAA compliant). |
| `text-secondary` | `#8C95A6` | Subtitles, parameter names, helper hints. |
| `text-muted` | `#535B6D` | Inactive states, table borders, disabled controls. |

---

## 3. Typography

The interface employs three complementary typefaces:

1. **Primary Interface:** `Geist Sans` or `Inter` (`font-sans`)
   - Clean, geometric neutral sans-serif designed for high-density dashboards.
   - Used for table bodies, forms, documentation, and navigational menus.
2. **Telemetry & Code:** `JetBrains Mono` (`font-mono`)
   - Monospace font with tabular numerals.
   - Used for API keys, token counters, USD limits, latency ms, JSON payloads, and CLI output.
3. **Display & Headers:** `Rajdhani` or `Orbitron` (`font-display`)
   - Angular, technological sans-serif reflecting the SAO system banner style (`[ BLACKBOARD ]`, `[ SYSTEM ROUTER ]`).
   - Uppercase, tracked spacing (`letter-spacing: 0.05em`).

---

## 4. UI Geometry & Component Language

### Floating Angular Panels
- Panels do not use standard generic rounded cards (`rounded-md`).
- Panels use sharp or beveled corners (`border-radius: 2px` to `4px`, or subtle 45-degree corner cutouts).
- Surface styling:
  ```css
  background: #12151D;
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  ```

### Status & Error Badges
- **Healthy / Active:** Sinon Turquoise text on `rgba(0, 240, 255, 0.08)` background.
- **Pending / Warning:** Aincrad Orange text on `rgba(255, 122, 0, 0.08)` background.
- **Security / Keys:** Underworld Purple text on `rgba(138, 63, 252, 0.08)` background.
- **Slash Error:** Slash Red text on `rgba(255, 42, 77, 0.12)` background with `border: 1px solid rgba(255, 42, 77, 0.3)`.

---

## 5. Audio Feedback (Sound Pack)

The cockpit includes an optional audio feedback system with a persistent toggle in the top status bar (`Mute / Sound On`):

| Event | Audio Identity | Tone / Sound Description |
|---|---|---|
| Menu Click / Select | SAO Menu Tap | Crisp, light synthetic high-frequency pop (30ms). |
| Warning / Failure | SAO System Alert | Two-tone descending chime in Slash Red context (150ms). |
| Auth / Connection Established | Link Start Ping | Resonant rising electronic chime (400ms). |
| Key Revoke / Delete | Slash Impact | Clean, sharp low-frequency transient cut. |

Audio files are stored locally in `frontend/public/sounds/` as lightweight, highly compressed `.ogg`/`.mp3` files (< 15KB each) and preloaded on user interaction.

---

## 7. Future Visual Refinements (Post-v0.3.0)

> Feedback note (2026-09-11): The current color palette feels slightly too generic. Needs deeper alignment with the source material.

- **Direct Anime Palette Extraction**: Extract exact hex codes directly from SAO anime frames and game UI assets (Aincrad menu gradients, GGO sniper scopes, Underworld system crystals) rather than generic dark-mode tokens.
- **Authentic Aesthetic Details**: Introduce non-generic SAO visual signatures:
  - 45-degree chamfered panel cuts (angular clipped corners instead of standard `rounded-[2px]`).
  - Subtle hexagonal HUD grid overlays.
  - Authentic circular player action wheel / menu popups.
  - Characteristic HP / system load gradient bars.
  - SAO UI sound effects on menu interactions.
