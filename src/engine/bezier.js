// Vector Curve Smoothing & Bezier Mathematics Engine
'use strict';

const maths = (function () {
    function maths() { }
    maths.zeros_Xx2x2 = x => { let zs = []; while (x--) { zs.push([0, 0]); } return zs; };
    maths.mulItems = (items, m) => [items[0] * m, items[1] * m];
    maths.mulMatrix = (m1, m2) => m1[0] * m2[0] + m1[1] * m2[1];
    maths.subtract = (a1, a2) => [a1[0] - a2[0], a1[1] - a2[1]];
    maths.addArrays = (a1, a2) => [a1[0] + a2[0], a1[1] + a2[1]];
    maths.addItems = (items, a) => [items[0] + a, items[1] + a];
    maths.sum = items => items.reduce((s, x) => s + x);
    maths.dot = (m1, m2) => m1[0] * m2[0] + m1[1] * m2[1];
    maths.vectorLen = v => Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    maths.divItems = (items, d) => [items[0] / d, items[1] / d];
    maths.squareItems = items => [items[0] * items[0], items[1] * items[1]];
    maths.normalize = function (v) { return this.divItems(v, this.vectorLen(v)); };
    maths.euclideanDistance = (ptA, ptB) => Math.sqrt(Math.pow(ptA.x - ptB.x, 2) + Math.pow(ptA.y - ptB.y, 2));
    return maths;
})();

const bezier = (function () {
    function bezier() { }
    bezier.q = (ctrlPoly, t) => {
        let tx = 1.0 - t;
        let pA = maths.mulItems(ctrlPoly[0], tx * tx * tx),
            pB = maths.mulItems(ctrlPoly[1], 3 * tx * tx * t),
            pC = maths.mulItems(ctrlPoly[2], 3 * tx * t * t),
            pD = maths.mulItems(ctrlPoly[3], t * t * t);
        return maths.addArrays(maths.addArrays(pA, pB), maths.addArrays(pC, pD));
    };
    bezier.qprime = (ctrlPoly, t) => {
        let tx = 1.0 - t;
        let pA = maths.mulItems(maths.subtract(ctrlPoly[1], ctrlPoly[0]), 3 * tx * tx),
            pB = maths.mulItems(maths.subtract(ctrlPoly[2], ctrlPoly[1]), 6 * tx * t),
            pC = maths.mulItems(maths.subtract(ctrlPoly[3], ctrlPoly[2]), 3 * t * t);
        return maths.addArrays(maths.addArrays(pA, pB), pC);
    };
    bezier.qprimeprime = (ctrlPoly, t) => {
        return maths.addArrays(
            maths.mulItems(maths.addArrays(maths.subtract(ctrlPoly[2], maths.mulItems(ctrlPoly[1], 2)), ctrlPoly[0]), 6 * (1.0 - t)),
            maths.mulItems(maths.addArrays(maths.subtract(ctrlPoly[3], maths.mulItems(ctrlPoly[2], 2)), ctrlPoly[1]), 6 * t)
        );
    };
    return bezier;
})();

export { maths, bezier };
