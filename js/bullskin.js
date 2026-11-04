/* Puts the bull terrier mesh (no skeleton) onto the shepherd's skeleton, so it can play the shepherd's real animations.
   Every bull vertex is weighted to the nearest bones (distance to each bone's segment), after the bull is stretched to the shepherd's bind-pose frame. */
(function () {
  /* Where each bone sits in the skinned mesh's own space in the bind pose. The inverse bind matrices give this, except for bones nothing is weighted to (the 'Nub' tips),
     whose inverse is zero: those are taken from the bone's place in the hierarchy instead. */
  window.bullBindPos = function (T, sm) {
    var sk = sm.skeleton, P = [], inv = new T.Matrix4().copy(sm.matrixWorld).invert(), i, q; sm.updateWorldMatrix(true, false); if (sm.parent) sm.parent.updateMatrixWorld(true); inv.copy(sm.matrixWorld).invert();
    for (i = 0; i < sk.bones.length; i++) {
      q = new T.Vector3().setFromMatrixPosition(new T.Matrix4().copy(sk.boneInverses[i]).invert());
      if (q.lengthSq() < 1e-12) { sk.bones[i].updateWorldMatrix(true, false); q = sk.bones[i].getWorldPosition(new T.Vector3()).applyMatrix4(inv); }
      P.push(q);
    }
    return P;
  };
  window.bullSkin = function (T, shepScene, bull) {
    var sm = null; shepScene.traverse(function (o) { if (o.isSkinnedMesh && !sm) sm = o; }); if (!sm) return null;
    var sk = sm.skeleton, bones = sk.bones, nb = bones.length, P = window.bullBindPos(T, sm), i, j, k;
    var seg = [];   // [a, b] bind-space endpoints per bone (bone to its first child bone; leaves point away from the parent)
    for (i = 0; i < nb; i++) {
      var b = bones[i], kid = null; for (j = 0; j < b.children.length; j++) if (b.children[j].isBone) { kid = b.children[j]; break; }
      var a = P[i].clone(), e;
      if (kid) e = P[bones.indexOf(kid)].clone(); else { var pi = b.parent && b.parent.isBone ? bones.indexOf(b.parent) : -1; e = pi >= 0 ? a.clone().add(a.clone().sub(P[pi]).multiplyScalar(0.6)) : a.clone(); }
      seg.push([a, e]);
    }
    var skip = {}, skipRe = bull.skipRe || /^_rootJoint$|^Pes_Root/; bones.forEach(function (b, ix) { if (skipRe.test(b.name)) skip[ix] = true; });
    // bull frame (x +-0.255, y 0..1.086, z +-0.604) to the shepherd bind frame (z -1..1, y -0.653..0.653)
    var N = bull.pos.length / 3, pos = new Float32Array(N * 3), sIdx = new Uint16Array(N * 4), sW = new Float32Array(N * 4), M = bull.map || {};
    var d = new Float32Array(nb), pv = new T.Vector3(), ab = new T.Vector3(), ap = new T.Vector3();
    for (i = 0; i < N; i++) {
      var x, y, z; if (bull.xf) { var o3 = bull.xf(bull.pos[i * 3], bull.pos[i * 3 + 1], bull.pos[i * 3 + 2]); x = o3[0]; y = o3[1]; z = o3[2]; } else { x = M.x(bull.pos[i * 3], bull.pos[i * 3 + 1], bull.pos[i * 3 + 2]); y = M.y(bull.pos[i * 3 + 1], bull.pos[i * 3 + 2]); z = M.z(bull.pos[i * 3 + 2], bull.pos[i * 3 + 1]); }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; pv.set(x, y, z);
      var allow = bull.cand ? bull.cand(pv) : null;   // optional: which bones this vertex may be weighted to (a Uint8Array over bone indices)
      for (k = 0; k < nb; k++) {
        if (skip[k] || (allow && !allow[k])) { d[k] = 1e9; continue; }
        ab.subVectors(seg[k][1], seg[k][0]); var L2 = ab.lengthSq(), t = 0; ap.subVectors(pv, seg[k][0]); if (L2 > 1e-9) t = Math.max(0, Math.min(1, ap.dot(ab) / L2));
        d[k] = pv.distanceTo(ab.multiplyScalar(t).add(seg[k][0]));
      }
      var best = [-1, -1, -1, -1], bd = [1e9, 1e9, 1e9, 1e9];
      for (k = 0; k < nb; k++) { var dk = d[k]; for (j = 0; j < 4; j++) if (dk < bd[j]) { for (var m = 3; m > j; m--) { bd[m] = bd[m - 1]; best[m] = best[m - 1]; } bd[j] = dk; best[j] = k; break; } }
      var ws = 0, w4 = [0, 0, 0, 0];
      for (j = 0; j < 4; j++) { w4[j] = best[j] < 0 ? 0 : Math.pow(bd[0] + 0.04, 3) / Math.pow(bd[j] + 0.04, 3); if (j > 0 && bd[j] > bd[0] * 2.2 + 0.08) w4[j] = 0; ws += w4[j]; }
      for (j = 0; j < 4; j++) { sIdx[i * 4 + j] = Math.max(0, best[j]); sW[i * 4 + j] = w4[j] / ws; }
    }
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(bull.nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(bull.uv, 2));
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(sIdx, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(sW, 4)); geo.setIndex(new T.BufferAttribute(bull.idx, 1)); geo.userData.keep = true;
    var mesh = new T.SkinnedMesh(geo, bull.mat); mesh.frustumCulled = false; mesh.bind(sk, sm.bindMatrix.clone());
    sm.parent.add(mesh); mesh.position.copy(sm.position); mesh.quaternion.copy(sm.quaternion); mesh.scale.copy(sm.scale); sm.visible = false; mesh.updateMatrixWorld(true);
    return mesh;
  };
})();
