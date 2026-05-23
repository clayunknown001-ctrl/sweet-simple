/**
 * SafeNet Full Engine — NSFW + Pose + Movement + BodyShape
 * window.SafeNet.analyze(imgElement, poseLandmarks?) -> { nsfw, body, movement }
 */
(function () {
  if (window.SafeNet) return;

  const state = {
    ready: true,
    cache: new Map(),
    prevPose: null,
  };

  function calculateBodyShape(lm) {
    if (!lm || lm.length < 25) return null;
    const leftHip = lm[23], rightHip = lm[24];
    const leftShoulder = lm[11], rightShoulder = lm[12];
    if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) return null;

    const hipWidth = Math.abs(leftHip.x - rightHip.x);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x) || 1e-6;
    const whr = hipWidth / shoulderWidth;

    // Torso vertikalligi (vertikal yotgan/turgan)
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;
    const torsoLen = Math.abs(midHipY - midShoulderY);

    // Suspicious: kuchli hip emphasis (whr > 1.15) yoki gorizontal poza (torsoLen < 0.08)
    const suspicious = whr > 1.15 || torsoLen < 0.08;

    return { whr, torsoLen, suspicious };
  }

  function analyzeMovement(prev, curr) {
    if (!prev || !curr || !prev[0] || !curr[0]) return { delta: 0, fast: false };
    let total = 0;
    const n = Math.min(prev.length, curr.length, 25);
    for (let i = 0; i < n; i++) {
      const dx = (curr[i].x || 0) - (prev[i].x || 0);
      const dy = (curr[i].y || 0) - (prev[i].y || 0);
      total += Math.sqrt(dx * dx + dy * dy);
    }
    const delta = total / n;
    return { delta, fast: delta > 0.04 };
  }

  window.SafeNet = {
    get ready() { return state.ready; },
    cache: state.cache,
    calculateBodyShape,
    analyzeMovement,
    analyze: async (imgElement, poseLandmarks = null) => {
      let nsfw = null;
      try {
        if (typeof window.classifyImage === "function") {
          nsfw = await window.classifyImage(imgElement);
        }
      } catch (e) {
        // ignore — nsfw engine may be loading
      }

      const body = poseLandmarks ? calculateBodyShape(poseLandmarks) : null;
      const movement = poseLandmarks ? analyzeMovement(state.prevPose, poseLandmarks) : null;
      if (poseLandmarks) state.prevPose = poseLandmarks;

      // Verdict
      const pornScore = nsfw?.Porn ?? 0;
      const hentaiScore = nsfw?.Hentai ?? 0;
      const sexyScore = nsfw?.Sexy ?? 0;
      const shouldBlur =
        pornScore > 0.7 ||
        hentaiScore > 0.7 ||
        (sexyScore > 0.6 && body?.suspicious) ||
        (body?.suspicious && movement?.fast);

      return { nsfw, body, movement, shouldBlur };
    },
  };

  console.log("[SafeNet] Full Engine loaded");
})();
