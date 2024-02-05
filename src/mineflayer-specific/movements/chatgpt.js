const size = 5; // Dimension size
const totalElements = size * size * size; // Total elements in the 1D array
let offset = [-1, 1, 1]; // Example shift offsets for x, y, z

// Function to translate 3D coordinates to 1D index and vice versa
const to1D = (x, y, z) => x + y * size + z * size * size;
const to3D = (index) => [
  index % size,
  Math.floor(index / size) % size,
  Math.floor(index / (size * size)) % size,
];

// Initialize your 3D array in a 1D format
let array = new Array(totalElements).fill(null).map((_, index) => index); // Example with sequential numbers

// Determine the direction of iteration based on the offset
const direction = offset.map(o => o >= 0 ? 'forward' : 'backward');

// Function to adjust the array in place
function shiftArrayInPlace(array, offset) {
  const [dx, dy, dz] = offset.map(o => Math.abs(o)); // Work with absolute offsets for calculation

  // Function to check if a given coordinate is within bounds after applying offset
  const isInBounds = (x, y, z) => (
    x >= 0 && x < size &&
    y >= 0 && y < size &&
    z >= 0 && z < size
  );

  // Perform shifting
  for (let z = (direction[2] === 'forward' ? 0 : size - 1); direction[2] === 'forward' ? z < size : z >= 0; direction[2] === 'forward' ? z++ : z--) {
    for (let y = (direction[1] === 'forward' ? 0 : size - 1); direction[1] === 'forward' ? y < size : y >= 0; direction[1] === 'forward' ? y++ : y--) {
      for (let x = (direction[0] === 'forward' ? 0 : size - 1); direction[0] === 'forward' ? x < size : x >= 0; direction[0] === 'forward' ? x++ : x--) {
        const index = to1D(x, y, z);
        let [newX, newY, newZ] = [x - dx, y - dy, z - dz]; // Apply the inverse of offset for calculation
        
        if (isInBounds(newX, newY, newZ)) {
          // If the new position is within bounds, move the value
          array[to1D(x, y, z)] = array[to1D(newX, newY, newZ)];
        } else {
          // Set out-of-bounds positions to a default value
          array[index] = null;
        }
      }
    }
  }
}

console.log(array)
// Shift the array in place
shiftArrayInPlace(array, offset);

console.log(array)

// `array` is now shifted in place with out-of-bounds values set to null
