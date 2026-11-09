# XR device testing

This guide covers browser/emulator checks and the manual headset checks that
automation cannot establish. For existing AR checks, see [AR testing](./ar-testing.md).
Supported views per device are listed in [ADR 0006](./adr/0006-supported-views.md).
Record headset results in the [device matrix](./device-matrix.md).

## Desktop Chrome: Immersive Web Emulator

1. Install the **Immersive Web Emulator** extension from the Chrome Web Store.
2. Open the deployed site over HTTPS, or a local development site served with
   HTTPS, then open the extension controls.
3. Select a Quest device profile. Try the controller and hand-tracking input
   modes, and enter each session mode offered by the page.
4. In the emulator's navigation view, click-drag to look around; use **W/S**
   to move forward/back and **A/D** to strafe. Give the emulator view focus
   before using its keyboard controls. The page suspends its own mouse, touch,
   and wheel handlers during immersive sessions so those gestures reach the
   emulator. Use XR hands/controllers for the in-scene panels.
5. Use the emulator to check layout, buttons, panel hit targets, and session
   lifecycle. It cannot verify DOM overlay behavior, passthrough, or real
   tracking quality.

## Opening the site on a headset

- Preferred: open the deployed GitHub Pages URL for this repository directly
  on the headset. HTTPS is required for WebXR.
- Local option: serve the development build over HTTPS using a locally trusted
  certificate (for example, one created with `mkcert`) and bind the dev server
  to the network interface. Open the HTTPS URL using the development machine's
  LAN address on the headset, and accept the certificate only if it is trusted
  on that device. Plain HTTP and `localhost` on the development computer are
  not reachable as secure origins from another device.

## Meta Quest checklist

Use Quest Browser on a real headset; run the same checklist once in AR and,
where available, once in VR.

- Enter and exit; confirm the session returns to screen mode normally.
- Confirm Exit is visible and reachable, including when a DOM overlay is not
  granted; the session must remain active without the overlay.
- Read panels at the intended 18px-equivalent minimum and tap panel controls.
- Rotate and scale the atom; confirm placement, then use Reset view.
- Wait for and acknowledge the break reminder.
- Try controller and hand input where available, including panel selection.
- Check comfort: seated use is possible, the exit remains visible, and there
  are no nausea cues or smooth locomotion.
- If testing Quest passthrough, verify it on the headset; the desktop emulator
  does not provide it.

## Controllers and hands (IWSDK input)

XR input, rays, and controller and hand models come from IWSDK (see ADR 0005). Open the
app with `?xrdebug=1` to see the IWSDK world state, session mode, input source count and
whether the lesson panels are showing.

In the Immersive Web Emulator, rays follow where each emulated controller or hand points.
The DevUI **Rot** fields are in radians; `Rot 0, 0, 0` points straight ahead. In the DevUI
gizmo the blue arrow is the controller's back (+Z); aim the blue ball end at the panels.

Headset checks:

- Panels appear about 1 m away: lesson on the left, build panel on the right, dock under
  the atom. Text is readable without leaning in; panels never follow the head.
- Trigger or pinch presses every button (Hint, Check, Free play, steppers, question
  options, Recenter, Reset atom, Exit). Poking a button with a fingertip also works.
- Recenter re-places the atom and panels in front of you.
- Switch between controllers and hands mid-session; both keep working.
- VR shows a dark room with a floor; AR keeps passthrough.

## Apple Vision Pro checklist

Use Safari. If WebXR is unavailable, enable **Settings > Apps > Safari >
Advanced > Feature Flags > WebXR Device API** (wording may vary by OS version),
then reload the deployed HTTPS page. Do not assume passthrough is available.

- Enter and exit; confirm the session returns to screen mode normally.
- Use gaze plus pinch to activate controls; confirm Exit is reachable and
  panels respond once to taps.
- Read panels at the intended 18px-equivalent minimum.
- Rotate and scale the atom, check its placement, and use Reset view.
- Wait for and acknowledge the break reminder.
- Check comfort: seated use is possible, the exit remains visible, and there
  are no nausea cues or smooth locomotion.
- Confirm the session remains usable if a DOM overlay is not granted.

## Capturing XR startup errors

Append `?xrdebug=1` to the page URL to show the XR diagnostics report on the
device. The copyable report includes the session mode and renderer reference
space, first/latest viewer poses, atom and panel-group world positions, the
atom's viewer-space distance/direction and frustum result, first-frame null-pose
status, renderer/layer/frame/view facts, VR environment presence, and objects
with hidden, zero-scale, or non-finite transforms. A hidden reticle is normal
while surface placement is inactive. If session startup fails, it also includes
the last error message and stack, with common personal identifiers redacted.
Copy the report before reloading; startup failures also return to screen mode
and the short status message dismisses automatically.

## Manual run log

Use one row per device, date, and tested mode. Link the full project-level
record in the [device matrix](./device-matrix.md).

| Device / browser | Date | Mode | Enter/exit | Exit reachable | Panels / taps | Rotate / scale / reset | Break / comfort | Hands / controllers | No-overlay result | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |

**Still unverified until a real headset is used:** hand-tracking quality,
comfort during extended use, and passthrough behavior on Quest. Emulator
results do not verify these properties.
