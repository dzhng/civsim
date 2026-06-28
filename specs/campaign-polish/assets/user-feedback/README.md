# User Feedback Images

These are the concrete screenshots that define the first campaign-polish pass.
They were copied from user-provided clipboard attachments so the spec does not
depend on temporary `/var` paths.

## Images

- `01-rome-ostia-label-road.png`
  - Check that the bottom-left coastal city near Rome, Ostia/Portus, keeps its
    label and road.
  - This looked fixed in the latest pass, but it must be verified before
    acceptance.
- `02-city-label-distance-tibur.png`
  - City labels are too far from their city icon/model.
  - Target margin: about one label/icon height.
- `03-mountains-roads-trees.png`
  - Ground reads brown instead of green.
  - Mountains look chunky and interfere with cities/roads/labels.
  - A city appears inside the mountain mass; treat that as a clearance and
    terrain-authoring failure.
  - Trees/forests are missing from the visible campaign scene.
  - Carts or road-life props are still absent.
- `04-rome-south-road-cutoff.png`
  - The road leaving Rome toward the south is visibly cut off before it reaches
    the next city.
  - Verify road continuity in a fake-scene workbench first, then in the real
    close Rome campaign scene.

## Rule

Every time new screenshot feedback arrives, copy the image into this spec before
acting on it, then add the issue to the relevant slice.

Do not keep temporary generated reports, visual diff folders, or broad migration
captures in this spec. Only explicit review inputs, accepted baselines, and
small focused crops that are used by the campaign-polish slices belong here.
