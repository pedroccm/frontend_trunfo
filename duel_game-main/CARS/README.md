# CARS Database

This folder contains the car data and images for the Super Trunfo game.

## File Structure

```
CARS/
├── cars.json          # Car database with attributes and metadata
├── README.md          # This file
└── *.jpg              # Car images (one for each car in cars.json)
```

## Adding New Cars

To add a new car to the game:

1. **Add the car data** to `cars.json` in the `cards` array:
   ```json
   {
       "id": "unique_car_id",
       "name": "Car Display Name",
       "image": "./CARS/unique_car_id.jpg",
       "attrs": {
           "maxSpeed": 350,
           "power": 800,
           "acceleration": 3.0,
           "displacement": 5000,
           "weight": 1500
       }
   }
   ```

2. **Add the car image** with the same filename as specified in the `image` field
   - Recommended format: JPG
   - Recommended size: Any size (will be automatically scaled to fit)
   - Name format: `{car_id}.jpg`

## Attribute Guidelines

- **maxSpeed**: Top speed in km/h (higher is better)
- **power**: Engine power in HP (higher is better)
- **acceleration**: 0-100 km/h time in seconds (lower is better)
- **displacement**: Engine displacement in cc (higher is better)
- **weight**: Car weight in kg (lower is better)

## Game Rules

- Each player gets equal number of unique cards
- No duplicates are dealt
- Winner takes the loser's card
- Cards go to the end of winner's stack
- Game ends when one player has no cards left

## Modifying Attributes

You can also modify the attribute definitions in the `attributes` section of `cars.json`:

```json
"attributes": {
    "attributeKey": {
        "name": "Display Name",
        "unit": "Unit Symbol",
        "direction": "max" // or "min"
    }
}
```

- `direction: "max"` means higher values win
- `direction: "min"` means lower values win