/** This function Multiplies two Matrices (a, b) */
// deno-lint-ignore no-unused-vars
function matrixMult(a, b) {
  const aNumRows = a.length;
  const aNumCols = a[0].length;
  const bNumCols = b[0].length;
  const m = new Array(aNumRows); // initialize array of rows
  for (let r = 0; r < aNumRows; ++r) {
    m[r] = new Array(bNumCols); // initialize the current row
    for (let c = 0; c < bNumCols; ++c) {
      m[r][c] = 0; // initialize the current cell
      for (let i = 0; i < aNumCols; ++i) {
        m[r][c] += a[r][i] * b[i][c];
      }
    }
  }
  return m;
}

//console.log(matrixMult([[1,2,3],[1,2,3],[1,2,3]], [[1,0,0], [0,1,0],[0,0,1]]));
