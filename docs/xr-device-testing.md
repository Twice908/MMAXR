# XR device testing

This guide covers browser/emulator checks and the manual headset checks that
automation cannot establish. For existing AR checks, see [AR testing](./ar-testing.md);
for the screen camera view, see [camera-view testing](./camera-view-testing.md).
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

## Controllers and hands (input rig)

Open the app with `?xrdebug=1` and use the XR report's `Input ...` lines. Each source
shows its kind, ray tracking, select/squeeze state, pressed gamepad buttons, select and
squeeze event counts, whether a system pinch has been seen, and its profiles. Record
anything that differs from the expectations below in the [device matrix](./device-matrix.md).

In the Immersive Web Emulator, rays follow where each emulated controller or hand points
(its target ray, local -Z). The DevUI **Rot** fields are in radians, so `Rot Y 1.04` turns a
controller 60° outward and its ray will miss the panel. In the DevUI gizmo the blue **arrow**
is the controller's +Z axis, which is its back: aim the blue **ball** end at the panel, not
the arrow. Set Rot to `0, 0, 0` (pointing
straight ahead), or click a controller's gizmo to switch it to rotate mode and turn it toward
the panel, then use the save icon so the pose persists. Controllers are drawn with the
official Meta Quest models and hands with the generic hand mesh (from
`apps/web/public/xr-input-profiles`); a blue stand-in with a nose cone along the ray shows
only while a model loads or for a device whose profile is not bundled.

Controllers (Quest Touch):

- Trigger clicks a panel button and drags sliders and particles. Expect `select` events
  and gamepad button 0 to agree; the report should show `buttons [0]`.
- Squeeze pans the model. Two controllers squeezing and moving apart zoom it.
- The thumbstick rotates the model sideways and zooms with up/down, only when no button
  is held. Confirm the stick is axes 2-3 (the report does not show axes; rotate to check).
- A/X clicks the panel under the ray, or checks the lesson step if none is hit. B/Y resets
  the view. Thumbstick click does nothing.
- Confirm the ray and reticle follow the controller, shorten on a hit, and brighten on press.
- Feel for the short haptic tick on hover and click.

Hands:

- Put the controllers down so hands appear in the report as `hand`. Pinch to click and
  drag. The report's `system select` should read `seen` if the browser reports pinch
  through events or the hand gamepad; `not seen` means the joint fallback is in use.
- Two hands pinching and moving apart zoom the model. Do not use the palm pinch (it opens
  the system menu or exits the session).
- In VR the hand mesh is drawn; in AR passthrough it is hidden.
- Switch between controllers and hands mid-session; both must keep working with no stuck press.
- Watch for ray drift at the moment of a pinch and report it.

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
