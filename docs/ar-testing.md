# AR testing

## Spatial panel checklist

1. Enter AR and confirm the atom remains world-fixed while four glass panels
   appear around it; mission is expanded and side panels start compact.
2. Tap a side-panel header to expand and collapse it. Tap panel controls and
   confirm the corresponding lesson or narration control responds once.
3. Confirm **Exit AR**, **Settings**, **Reset view**, and **Expand/Collapse panels**
   remain usable. The Settings fallback should open the existing DOM controls.
   Rotate or scale the atom and verify the panels do not move with it.
4. Confirm the compact Settings panel opens, its sound/captions/speed controls
   reflect the existing DOM values, and replay/reset/panel visibility work.
   Confirm edge hints for off-screen panels are non-interactive in AR.
5. Exit and re-enter twice; no old panels or hints should remain.
6. If panel creation or text drawing fails, confirm the session continues and
   the existing DOM panels remain visible.
7. Recheck ordinary screen mode after exiting AR; its existing layout should
   remain unchanged.

## Ionic Bonding AR checklist (added 2026-11-10)

Android phone with ARCore (Chrome), handheld AR with the DOM overlay:

1. Open Ionic Bonding, press **Enter AR**, read the consent text, press **Start AR**.
   The model (Na and Cl, about 30 cm wide) appears in front of the camera, with the
   top bar (status, Reset view, red Exit AR) and the Mission / Atoms tabs at the bottom.
2. The step text and result line stay visible above the sheet. The Na and Cl labels and
   the glowing ring sit on the atoms and follow them as you move the phone.
3. Drag the ring from sodium onto chlorine with one finger: the electron leaves sodium,
   chlorine highlights, and on release Na+ (2,8) and Cl- (2,8,8) appear with the
   attraction line. Also try tap ring, then tap chlorine.
4. One-finger drag on an empty part of the view turns the model; pinch resizes it;
   Reset view puts it back. Turning direction in AR is unchanged from before.
5. Press Check; the Mission sheet opens with the question. Finish both missions.
6. Exit AR returns to the web view with the same progress. Re-enter twice; no leftovers.

Desktop (IWSDK emulator, `pnpm --filter @mma/web dev`) and headsets:

1. **Enter AR** starts the emulator session (no camera feed). Lesson panel on the left,
   Atoms and ions panel on the right, Recenter / Exit dock under the model. No page
   overlays (cards, labels, rings) show over the emulator view.
2. With a controller ray, press **Move an outer electron from sodium to chlorine**; the
   cards update to Na+ / Cl- and **Join the ions** becomes the main action.
3. Press Join the ions, Check, and answer the questions on the lesson panel.
4. **Recenter** re-places the model and panels; **Exit AR** returns to the web view.
