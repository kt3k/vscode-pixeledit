/*
 *
 *  function Template
 *
 *  function transformation_name(points, others){
 *	//points -> array of point of object
 *	//others -> any othee parameters the specific transformation requires
 *
 *	return points;//This is the tranaformed Points
 *  }
 *
 *  example:
 *  	function translation(points, tPoint){
 *  	  //points -> array of point of Object
 *	  //tPoint -> Points to be Translated
 *
 *	  //Do Processing
 *
 *	  return points;//This is translated points
 *	}
 *
 */

// deno-lint-ignore no-unused-vars
function translate(points, pt) {
  /* This function translates the object to the new co-ords by pt units */

  for (const p of points) {
    const a = [
      [p.x],
      [p.y],
      [1],
    ];
    const transMatrix = [
      [1, 0, pt.x],
      [0, 1, pt.y],
      [0, 0, 1],
    ];
    const ans = matrixMult(transMatrix, a);

    p.x = ans[0][0];
    p.y = ans[1][0];
  }
  return points;
}

// deno-lint-ignore no-unused-vars
function scale(points, sx, sy, pf) {
  /* This function Scales the object  with sx along x-axis and sy along y-axis with a fixed point pf */
  for (const p of points) {
    const a = [
      [p.x],
      [p.y],
      [1],
    ];
    const scaMatrix = [
      [sx, 0, 0],
      [0, sy, 0],
      [0, 0, 1],
    ];

    const transToMatrix = [
      [1, 0, -pf.x],
      [0, 1, -pf.y],
      [0, 0, 1],
    ];

    const transBackMatrix = [
      [1, 0, pf.x],
      [0, 1, pf.y],
      [0, 0, 1],
    ];
    let ans = matrixMult(transToMatrix, a);
    ans = matrixMult(scaMatrix, ans);
    ans = matrixMult(transBackMatrix, ans);

    p.x = ans[0][0];
    p.y = ans[1][0];
  }
  return points;
}

// deno-lint-ignore no-unused-vars
function rotate(points, angle, pf) {
  /* This function rotates the object with angle with respect to fixed Point pf */
  angle = angle * (Math.PI / 180.0);
  for (const p of points) {
    const a = [
      [p.x],
      [p.y],
      [1],
    ];
    const rotMatrix = [
      [Math.cos(angle), -Math.sin(angle), 0],
      [Math.sin(angle), Math.cos(angle), 0],
      [0, 0, 1],
    ];

    const transToMatrix = [
      [1, 0, -pf.x],
      [0, 1, -pf.y],
      [0, 0, 1],
    ];

    const transBackMatrix = [
      [1, 0, pf.x],
      [0, 1, pf.y],
      [0, 0, 1],
    ];
    let ans = matrixMult(transToMatrix, a);
    ans = matrixMult(rotMatrix, ans);
    ans = matrixMult(transBackMatrix, ans);

    p.x = ans[0][0];
    p.y = ans[1][0];
  }

  return points;
}
//console.log(rotate([{"x": 20, "y": 20},{"x": 80, "y": 20},{"x": 50, "y": 50}], 90, {"x": 50, "y": 30}));
