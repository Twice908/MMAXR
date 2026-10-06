# Screen camera view testing

Camera view is a screen-only webcam backdrop, not AR: it does not track the
world, so the atom stays centred in the screen scene and does not remain fixed
to a real surface. The camera feed is displayed locally; frames are not
recorded, captured, or uploaded.

## Desktop checklist

1. Use Chrome on HTTPS or `localhost` with a webcam and confirm **Camera view**
   appears. On desktop pointer devices it remains available even if an XR
   emulator reports immersive AR support.
2. Open **Camera view** and choose **Cancel**; confirm the permission request
   does not start. Open it again and choose **Start**.
3. Confirm live video fills the viewport behind the atom, the video is mirrored,
   and the atom itself is not mirrored. Drag to rotate, use the wheel or a
   Mac trackpad pinch to zoom, and verify lesson controls and particle inputs
   still work.
4. Exit, hide the tab, and simulate a disconnected or busy camera. Each path
   should remove the video, turn off the camera indicator, and return to screen
   mode without changing lesson state.

## Phone checklist

1. On an AR-capable touch-first phone, confirm the existing **View in AR** flow
   is unchanged and the screen camera-view control is hidden.
2. On a phone without immersive AR, check screen mode remains usable and the
   browser-camera permission explanation appears before any camera prompt.
3. Confirm pinch, drag, and lesson controls work as before; stop the camera
   view and check that the camera indicator turns off.

Automated browser tests use Chromium's fake camera device and fake permission
UI. Verify Mac trackpad pinch on physical hardware as well: desktop wheel
events are routed to the shared screen zoom input, but gesture-to-wheel
translation depends on the OS and browser.

Camera-view availability checks secure context and camera access first. It
suppresses the screen camera only when immersive AR is supported and there is
no fine pointer (`any-pointer: fine`); this keeps desktop browsers with an XR
emulator from losing the camera option. In development, a suppression reason
is logged to the console and shown under **Events**.
