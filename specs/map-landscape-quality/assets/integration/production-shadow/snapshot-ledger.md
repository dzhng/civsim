# Snapshot change ledger

The ten changed pins preserve the same scene inputs, behavioral assertions and
zero-pixel repeat requirement. Only the accepted shared shadow fitting and
aerial-ray correction move the image. No simulation, unit stats or gate limits
change in this checkpoint. Counts below compare the final capture to the prior
canonical snapshot, using the existing snapshot comparator.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `campaign-composition` in `campaign-composition` | Prior canonical image; final candidate differs by 136844 px differ (13.3637%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-composition-selected` in `campaign-composition` | Prior canonical image; final candidate differs by 138999 px differ (13.5741%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-composition-fog` in `campaign-composition` | Prior canonical image; final candidate differs by 134699 px differ (13.1542%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-composition-flat` in `campaign-composition` | Prior canonical image; final candidate differs by 134977 px differ (13.1813%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-composition-dpr2` in `campaign-composition` | Prior canonical image; final candidate differs by 547151 px differ (13.3582%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-production-overview` in `campaign-physical-overview` | Prior canonical image; final candidate differs by 41184 px differ (4.0219%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-production-physical` in `campaign-production` | Prior canonical image; final candidate differs by 71866 px differ (7.0182%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-production-physical-selected` in `campaign-production` | Prior canonical image; final candidate differs by 61046 px differ (5.9615%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-production-physical-dpr2` in `campaign-production` | Prior canonical image; final candidate differs by 285909 px differ (6.9802%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
| `campaign-production-physical-selected-dpr2` in `campaign-production` | Prior canonical image; final candidate differs by 242566 px differ (5.9220%). | Reviewed merged image; exact repeat: 0 differing pixels. | Shared sun fit and normalized aerial-ray intersection; contact, labels and water continuity accepted by fresh review. **moved** |
