## Notes on layers.csv

- Using layers.csv takes precedence over using the filename as a way to define rarity
- To create downstream traits rarity (traits that specify their rarity based on another trait) is done creating new columns with the format `layer#trait` and specifying their rarity if the trait on the row is selected.
- Trait rarity is **not** 100% based but instead the addition of all rarity values per layer so if the best way to guruantee a downstream trait is by using a large number. You can also use 0 to make sure a downstream layer is never used
- You can see an example of the layers.csv file at https://github.com/Meta-Angels/hashlips_art_engine/blob/main/layers/layers.csv. It is best to use Excel when editing this file
