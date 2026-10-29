// ==========================================
// محرك التحليل متعدد الأبعاد
// ==========================================

const Analysis = {

  // الأبعاد المدعومة وأوزانها الافتراضية
  DIMENSIONS: {
    markov: 0.25,
    gap: 0.15,
    time_hour: 0.10,
    time_minute: 0.10,
    day: 0.10,
    date: 0.05,
    round_mod_8: 0.05,
    round_mod_10: 0.05,
    round_mod_17: 0.05,
    bigram: 0.10
  },

  // ==========================================
  // 1. تحميل كل الجولات مع معلومات الحزم
  // ==========================================
  async _loadAllRounds() {
            const allRounds = await DB.getAll("rounds");
            const rounds = allRounds.filter(r => r.is_prediction_source !== true);
    const packages = await DB.getAll('packages');
    const pkgMap = {};
    packages.forEach(p => pkgMap[p.id] = p);

    // ترتيب الجولات حسب رقمها
    rounds.sort((a, b) => a.round_number - b.round_number);

    // إرفاق معلومات الحزمة لكل جولة
    return rounds.map(r => ({
      ...r,
      date: pkgMap[r.package_id]?.date || '',
      day: pkgMap[r.package_id]?.day || '',
      is_continuous: pkgMap[r.package_id]?.is_continuous_with_previous
    }));
  },

  // ==========================================
  // 2. استخراج قائمة العناصر الفريدة
  // ==========================================
  _extractItems(rounds) {
    return [...new Set(rounds.map(r => r.item_name))].filter(Boolean);
  },

  // ==========================================
  // 3. بناء كل الأنماط
  // ==========================================
  async _buildAllPatterns(rounds) {
    const patterns = {};
    const items = this._extractItems(rounds);
    const totalRounds = rounds.length;

    // --- بعد 1: ماركوف (الانتقال من عنصر لآخر) ---
    patterns.markov = {};
    for (let i = 0; i < rounds.length - 1; i++) {
      const curr = rounds[i];
      const next = rounds[i + 1];
      // إذا كانت هناك فجوة (حزمة غير متصلة)، لا نربط
      if (next.package_id !== curr.package_id && next.is_continuous === false) continue;
      const key = curr.item_name;
      if (!patterns.markov[key]) patterns.markov[key] = {};
      patterns.markov[key][next.item_name] = (patterns.markov[key][next.item_name] || 0) + 1;
    }

    // --- بعد 2: الفجوات (آخر ظهور لكل عنصر) ---
    patterns.gap = {};
    items.forEach(item => patterns.gap[item] = 0);
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (patterns.gap[rounds[i].item_name] === 0) {
        patterns.gap[rounds[i].item_name] = totalRounds - i;
      }
    }

    // --- بعد 3: الساعة ---
    patterns.time_hour = {};
    rounds.forEach(r => {
      if (r.hour === null || r.hour === undefined) return;
      const key = String(r.hour);
      if (!patterns.time_hour[key]) patterns.time_hour[key] = {};
      patterns.time_hour[key][r.item_name] = (patterns.time_hour[key][r.item_name] || 0) + 1;
    });

    // --- بعد 4: الدقيقة (مجمعة في فترات 5 دقائق) ---
    patterns.time_minute = {};
    rounds.forEach(r => {
      if (r.minute === null || r.minute === undefined) return;
      const bucket = Math.floor(r.minute / 5) * 5;
      const key = String(bucket);
      if (!patterns.time_minute[key]) patterns.time_minute[key] = {};
      patterns.time_minute[key][r.item_name] = (patterns.time_minute[key][r.item_name] || 0) + 1;
    });

    // --- بعد 5: اليوم ---
    patterns.day = {};
    rounds.forEach(r => {
      if (!r.day) return;
      if (!patterns.day[r.day]) patterns.day[r.day] = {};
      patterns.day[r.day][r.item_name] = (patterns.day[r.day][r.item_name] || 0) + 1;
    });

    // --- بعد 6: التاريخ ---
    patterns.date = {};
    rounds.forEach(r => {
      if (!r.date) return;
      if (!patterns.date[r.date]) patterns.date[r.date] = {};
      patterns.date[r.date][r.item_name] = (patterns.date[r.date][r.item_name] || 0) + 1;
    });

    // --- بعد 7: رقم الجولة (mod 8, mod 10, mod 17) ---
    [8, 10, 17].forEach(mod => {
      const dimName = 'round_mod_' + mod;
      patterns[dimName] = {};
      rounds.forEach(r => {
        const key = String(r.round_number % mod);
        if (!patterns[dimName][key]) patterns[dimName][key] = {};
        patterns[dimName][key][r.item_name] = (patterns[dimName][key][r.item_name] || 0) + 1;
      });
    });

    // --- بعد 8: Bigram (آخر عنصرين → العنصر التالي) ---
    patterns.bigram = {};
    for (let i = 2; i < rounds.length; i++) {
      const prev2 = rounds[i - 2];
      const prev1 = rounds[i - 1];
      const curr = rounds[i];
      if (curr.package_id !== prev1.package_id && curr.is_continuous === false) continue;
      const key = `${prev2.item_name}->${prev1.item_name}`;
      if (!patterns.bigram[key]) patterns.bigram[key] = {};
      patterns.bigram[key][curr.item_name] = (patterns.bigram[key][curr.item_name] || 0) + 1;
    }

    return patterns;
  },

  // ==========================================
  // 4. حفظ الأنماط في IndexedDB
  // ==========================================
  async _savePatterns(patterns) {
    // مسح الأنماط القديمة
    const db = await DB.open();
    await new Promise((resolve) => {
      const tx = db.transaction('analysis_cache', 'readwrite');
      tx.objectStore('analysis_cache').clear();
      tx.oncomplete = resolve;
    });

    // حفظ الأنماط الجديدة
    for (const dimension in patterns) {
      for (const key in patterns[dimension]) {
        for (const nextItem in patterns[dimension][key]) {
          await DB.add('analysis_cache', {
            dimension: dimension,
            key_value: key,
            next_item: nextItem,
            count: patterns[dimension][key][nextItem]
          });
        }
      }
    }
  },

  // ==========================================
  // 5. الحصول على توزيع الاحتمالات لبعد معين
  // ==========================================
  async _getDistribution(dimension, keyValue) {
    const cache = await DB.getAll('analysis_cache');
    const relevant = cache.filter(c => c.dimension === dimension && c.key_value === keyValue);
    if (relevant.length === 0) return {};
    const total = relevant.reduce((s, c) => s + c.count, 0);
    const dist = {};
    relevant.forEach(c => dist[c.next_item] = c.count / total);
    return dist;
  },

  // ==========================================
  // 6. حساب درجات الفجوة (بدون مفتاح)
  // ==========================================
  async _computeGapScores(currentRound) {
    const rounds = await this._loadAllRounds();
    const items = this._extractItems(rounds);
    const scores = {};
    items.forEach(item => {
      // آخر ظهور للعنصر
      let lastSeenRound = 0;
      for (let i = rounds.length - 1; i >= 0; i--) {
        if (rounds[i].item_name === item) {
          lastSeenRound = rounds[i].round_number;
          break;
        }
      }
      const gap = currentRound - lastSeenRound;
      // كلما زادت الفجوة، زاد احتمال الظهور (عكسي)
      scores[item] = gap > 0 ? Math.min(1, gap / 50) : 0;
    });
    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    if (total > 0) Object.keys(scores).forEach(k => scores[k] /= total);
    return scores;
  },

  // ==========================================
  // 7. الحصول على آخر جولتين (لـ Bigram)
  // ==========================================
  async _getRecentItems(beforeRound, count) {
    const rounds = await this._loadAllRounds();
    const filtered = rounds.filter(r => r.round_number < beforeRound);
    filtered.sort((a, b) => b.round_number - a.round_number);
    return filtered.slice(0, count).map(r => r.item_name);
  },

  // ==========================================
  // 8. الحصول على الأوزان الحالية
  // ==========================================
  async _getWeights() {
    const stored = await DB.get('app_settings', 'dimension_weights');
    if (stored && stored.value) return stored.value;
    return { ...this.DIMENSIONS };
  },

  // ==========================================
  // 9. تحديث أوزان بُعد معين بعد التوقع
  // ==========================================
  async _updateWeight(dimension, wasCorrect) {
    const weights = await this._getWeights();
    if (weights[dimension] === undefined) return;
    if (wasCorrect) {
      weights[dimension] = Math.min(0.5, weights[dimension] * 1.1);
    } else {
      weights[dimension] = Math.max(0.01, weights[dimension] * 0.9);
    }
    // إعادة تطبيع الأوزان
    const sum = Object.values(weights).reduce((s, v) => s + v, 0);
    Object.keys(weights).forEach(k => weights[k] /= sum);
    await DB.put('app_settings', { key: 'dimension_weights', value: weights });
  },

  // ==========================================
  // 10. التوقع الرئيسي
  // ==========================================
  async predict(context) {
    const { round_number, item_name, hour, minute, day, date } = context;
    const items = this._extractItems(await this._loadAllRounds());

    const contributions = {};
    items.forEach(item => contributions[item] = { total: 0, breakdown: {} });

    const weights = await this._getWeights();

    // جمع الاحتمالات من كل بعد
    const addDist = (dimension, dist) => {
      if (!dist || Object.keys(dist).length === 0) return;
      const w = weights[dimension] || 0;
      for (const item in dist) {
        if (contributions[item]) {
          contributions[item].total += w * dist[item];
          contributions[item].breakdown[dimension] = dist[item];
        }
      }
    };

    // 1. ماركوف
    addDist('markov', await this._getDistribution('markov', item_name));

    // 2. الفجوة
    const gapScores = await this._computeGapScores(round_number);
    if (Object.keys(gapScores).length > 0) addDist('gap', gapScores);

    // 3. الساعة
    if (hour !== null && hour !== undefined) {
      addDist('time_hour', await this._getDistribution('time_hour', String(hour)));
    }

    // 4. الدقيقة (bucket)
    if (minute !== null && minute !== undefined) {
      const bucket = Math.floor(minute / 5) * 5;
      addDist('time_minute', await this._getDistribution('time_minute', String(bucket)));
    }

    // 5. اليوم
    if (day) addDist('day', await this._getDistribution('day', day));

    // 6. التاريخ
    if (date) addDist('date', await this._getDistribution('date', date));

    // 7. رقم الجولة (mods)
    for (const mod of [8, 10, 17]) {
      const dimName = 'round_mod_' + mod;
      const dist = await this._getDistribution(dimName, String(round_number % mod));
      addDist(dimName, dist);
    }

    // 8. Bigram
    const recent = await this._getRecentItems(round_number, 2);
    if (recent.length >= 2) {
      const bigramKey = `${recent[1]}->${recent[0]}`;
      addDist('bigram', await this._getDistribution('bigram', bigramKey));
    }

    // اختيار الأعلى
    let best = null;
    for (const item in contributions) {
      if (!best || contributions[item].total > contributions[best].total) {
        best = item;
      }
    }

    // [FIX-C5] تطبيع score إلى [0,1]
        let activeWeightSum = 0;
        if (best) {
            for (const dim in contributions[best].breakdown) {
                activeWeightSum += (weights[dim] || 0);
            }
        }
        const normalizedScore = (best && activeWeightSum > 0)
            ? contributions[best].total / activeWeightSum
            : 0;
        return {
            predicted_item: best,
            score: normalizedScore,
            breakdown: best ? contributions[best].breakdown : {}
        };
  },

  // ==========================================
  // 11. التشغيل الرئيسي (يُستدعى بعد كل حفظ حزمة)
  // ==========================================
  async run() {
    const rounds = await this._loadAllRounds();
    if (rounds.length < 5) {
      console.log('بيانات غير كافية للتحليل (أقل من 5 جولات)');
      return;
    }
    const patterns = await this._buildAllPatterns(rounds);
    await this._savePatterns(patterns);
    console.log('تم تحديث الأنماط. عدد الجولات المحللة:', rounds.length);
  }
};

// تصدير
window.Analysis = Analysis;
