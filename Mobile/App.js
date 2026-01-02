import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export default function App() {
  const { width } = useWindowDimensions();
  const canvasW = Math.min(width - 24, 360);
  const canvasH = 240;

  // Simple navigation (no react-navigation dependency)
  const [screen, setScreen] = useState('home'); // 'home' | 'proyektil'

  const [angle, setAngle] = useState(45); // degrees
  const [speed, setSpeed] = useState(25); // m/s
  const [gravity, setGravity] = useState(9.8); // m/s2
  const [mass, setMass] = useState(1.0); // kg
  const [points, setPoints] = useState([]);
  const [stats, setStats] = useState(null);

  function simulateProjectile(angleDeg, v, g = 9.8, massVal = 1.0) {
    const angle = (angleDeg * Math.PI) / 180;
    let vx = v * Math.cos(angle);
    let vy = v * Math.sin(angle);
    const k = 0.02;
    const dt = 0.02;
    let t = 0;
    const pts = [];
    let maxY = 0;
    let px = 0;
    let py = 0;
    let steps = 0;
    const maxSteps = 20000;
    const scale = 1; // compute raw meters, scale later to fit
    while (steps < maxSteps) {
      const speedNow = Math.sqrt(vx * vx + vy * vy);
      const ax = speedNow > 0 ? (-(k / massVal) * speedNow * vx) : 0;
      const ay = -g + (speedNow > 0 ? (-(k / massVal) * speedNow * vy) : 0);
      vx += ax * dt;
      vy += ay * dt;
      px += vx * dt;
      py += vy * dt;
      t += dt;
      if (py > maxY) maxY = py;
      pts.push({ x: px * scale, y: py * scale });
      if (py <= 0 && t > 0.02) break;
      steps++;
    }
    const flightTime = +t.toFixed(2);
    const range = +px.toFixed(2);
    const maxHeight = +maxY.toFixed(2);
    return { points: pts, flightTime, range, maxHeight };
  }

  function fitPointsToSvg(rawPoints, w, h, padding = 20) {
    if (!rawPoints || rawPoints.length === 0) return { d: '', cx: 0, cy: 0, r: 0, mapped: [] };
    // find extents
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rawPoints.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    // ensure ground at y=0 included
    if (minY > 0) minY = 0;
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const availW = Math.max(10, w - padding * 2);
    const availH = Math.max(10, h - padding * 2);
    const scale = Math.min(availW / worldW, availH / worldH);
    // map function: world -> svg coords
    function map(p) {
      const x = padding + (p.x - minX) * scale;
      // svg y runs down; want ground at bottom
      const y = h - padding - (p.y - minY) * scale;
      return { x, y };
    }
    const mapped = rawPoints.map(map);
    // create path d
    const d = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const last = mapped[mapped.length - 1];
    return { d, cx: last.x, cy: last.y, r: Math.max(4, Math.min(10, (w + h) / 100)), mapped };
  }

  function onRun() {
    const res = simulateProjectile(angle, speed, gravity, mass);
    setPoints(res.points);
    setStats({ flightTime: res.flightTime, range: res.range, maxHeight: res.maxHeight });
  }

  const pathInfo = useMemo(() => fitPointsToSvg(points, canvasW, canvasH), [points, canvasW, canvasH]);

  // Animation state & refs
  const animRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const [currentIdx, setCurrentIdx] = useState(-1);

  // start animation whenever mapped points change
  React.useEffect(() => {
    mountedRef.current = true;
    // cancel previous animation
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    setCurrentIdx(-1);
    const mapped = pathInfo && pathInfo.mapped ? pathInfo.mapped : [];
    if (!mapped || mapped.length === 0) return;

    // animate along mapped points
    let i = 0;
    function frame() {
      if (!mountedRef.current) return;
      setCurrentIdx(i);
      i += 1;
      if (i < mapped.length) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        animRef.current = null;
      }
    }
    // start animation
    animRef.current = requestAnimationFrame(frame);

    return () => {
      mountedRef.current = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [pathInfo && pathInfo.mapped]);

  // Home screen
  if (screen === 'home') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.homeTitle}>virtuallab31</Text>

        <View style={styles.homeCardWrap}>
          <TouchableOpacity
            style={[styles.homeCard, styles.homeCardPrimary]}
            onPress={() => setScreen('proyektil')}
          >
            <Text style={styles.homeCardTitle}>Modul Proyektil</Text>
            <Text style={styles.homeCardSubtitle}>Simulasi gerak proyektil</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.homeCard, styles.homeCardDisabled]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={styles.homeCardTitle}>Modul lainnya</Text>
            <Text style={styles.homeCardSubtitle}>Coming soon</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Proyektil screen
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.proHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('home')}>
          <Text style={styles.backBtnText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gerak Proyektil</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <Text style={styles.label}>Sudut: {angle.toFixed(0)}°</Text>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={85}
            value={angle}
            onValueChange={v => setAngle(Number(v))}
            minimumTrackTintColor="#3b82f6"
            maximumTrackTintColor="#ddd"
            step={1}
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Kecepatan: {speed.toFixed(0)} m/s</Text>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={100}
            value={speed}
            onValueChange={v => setSpeed(Number(v))}
            minimumTrackTintColor="#3b82f6"
            maximumTrackTintColor="#ddd"
            step={1}
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Gravitasi: {gravity.toFixed(1)} m/s²</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={20}
            value={gravity}
            onValueChange={v => setGravity(Number(v))}
            minimumTrackTintColor="#3b82f6"
            maximumTrackTintColor="#ddd"
            step={0.1}
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Massa: {mass.toFixed(1)} kg</Text>
          <Slider
            style={styles.slider}
            minimumValue={0.1}
            maximumValue={10}
            value={mass}
            onValueChange={v => setMass(Number(v))}
            minimumTrackTintColor="#3b82f6"
            maximumTrackTintColor="#ddd"
            step={0.1}
          />
        </View>

        <TouchableOpacity style={styles.runBtn} onPress={onRun}>
          <Text style={styles.runBtnText}>Jalankan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.canvasWrap}>
        <Svg width={canvasW} height={canvasH} style={styles.canvas}>
          {/* background ground */}
          <Rect x={0} y={canvasH - 18} width={canvasW} height={18} fill="#6b4226" />
          {/* path */}
          {pathInfo.d ? <Path d={pathInfo.d} stroke="#7dd3fc" strokeWidth={2} fill="none" /> : null}
          {/* ball */}
          {/* animated ball: use current index if animating, otherwise show last point */}
          {pathInfo.mapped && pathInfo.mapped.length ? (
            (() => {
              const mp = pathInfo.mapped;
              const idx = currentIdx >= 0 && currentIdx < mp.length ? currentIdx : mp.length - 1;
              const p = mp[idx];
              return <Circle cx={p.x} cy={p.y} r={pathInfo.r} fill="#fb7185" />;
            })()
          ) : null}
        </Svg>
      </View>

      <View style={styles.stats}>
        <Text style={{ color: '#e5e7eb' }}>Waktu Terbang: {stats ? stats.flightTime + ' s' : '-'}</Text>
        <Text style={{ color: '#e5e7eb' }}>Jarak: {stats ? stats.range + ' m' : '-'}</Text>
        <Text style={{ color: '#e5e7eb' }}>Tinggi Maks: {stats ? stats.maxHeight + ' m' : '-'}</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#0f172a', // match web dark background
    flexGrow: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginVertical: 8,
    color: '#e5e7eb',
  },

  // Home
  homeTitle: {
    fontSize: 26,
    fontWeight: '700',
    marginVertical: 18,
    textTransform: 'lowercase',
    color: '#e5e7eb',
  },
  homeCardWrap: {
    width: '100%',
    maxWidth: 640,
    gap: 12,
  },
  homeCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  homeCardPrimary: {
    backgroundColor: '#0b1f3a',
    borderColor: '#7dd3fc',
  },
  homeCardDisabled: {
    backgroundColor: '#111827',
    borderColor: '#334155',
  },
  homeCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    color: '#e5e7eb',
  },
  homeCardSubtitle: {
    color: '#94a3b8',
  },

  // Proyektil header
  proHeader: {
    width: '100%',
    maxWidth: 640,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  backBtnText: {
    fontWeight: '600',
    color: '#e5e7eb',
  },

  controls: {
    width: '100%',
    maxWidth: 640,
    marginBottom: 12,
  },
  controlRow: {
    marginVertical: 8,
  },
  label: {
    marginBottom: 6,
    color: '#e5e7eb',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  runBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  runBtnText: {
    color: '#0b1220',
    fontWeight: '700',
  },
  canvasWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    backgroundColor: '#071024',
    padding: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  canvas: {
    backgroundColor: '#001219',
    borderRadius: 8,
  },
  stats: {
    marginTop: 12,
    width: '100%',
    maxWidth: 640,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 12,
    padding: 12,
  },
});
