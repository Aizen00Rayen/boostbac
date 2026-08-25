import React, { useEffect } from "react";
import { View, StyleSheet, Text, Image, ImageStyle, StyleProp } from "react-native";
import Svg, { Circle, Polyline, Line, Defs, LinearGradient, Stop, Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { colors, font } from "@/src/theme";

const MASCOT_ASPECT = 566 / 712; // boo-mascot.png intrinsic width/height

// -------------------------------------------------------------- Boo the mascot
// Every "PaperPlane" call-site across the app (loaders, empty states, splash,
// celebration screens) renders the brand mascot through this one component —
// kept the old name so none of those call-sites needed to change.
export function PaperPlane({
  size = 28,
  style,
  flip = false,
}: {
  size?: number;
  color?: string; // unused now — the mascot has fixed brand colors — kept so old call-sites typecheck
  style?: StyleProp<ImageStyle>;
  flip?: boolean;
}) {
  return (
    <Image
      source={require("@/assets/images/boo-mascot.png")}
      style={[
        { width: size, height: size / MASCOT_ASPECT, transform: flip ? [{ scaleX: -1 }] : undefined },
        style,
      ]}
      resizeMode="contain"
    />
  );
}

// Bouncing mascot loader (Duolingo-style idle bob, not a "flying" animation).
export function PaperPlaneLoader({ size = 56, label }: { size?: number; label?: string }) {
  const bob = useSharedValue(0);
  const rot = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 560, easing: Easing.inOut(Easing.ease) }), -1, true);
    rot.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 620, easing: Easing.inOut(Easing.ease) }),
        withTiming(6, { duration: 620, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, []);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 * bob.value }, { rotate: `${rot.value}deg` }],
  }));

  return (
    <View style={styles.loaderWrap}>
      <Animated.View style={anim}>
        <View style={styles.glowDot}>
          <PaperPlane size={size} />
        </View>
      </Animated.View>
      {label ? <Text style={styles.loaderLabel}>{label}</Text> : null}
    </View>
  );
}

// -------------------------------------------------------------- Progress ring
export function ProgressRing({
  progress,
  size = 64,
  stroke = 7,
  children,
}: {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - p);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceTertiary} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.brand}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>{children}</View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------- Line chart
type Point = { label: string; retention: number | null };
export function ForgettingCurve({ data, width, height = 160 }: { data: Point[]; width: number; height?: number }) {
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const w = width - padL - padR;
  const h = height - padT - padB;

  const pts = data
    .map((d, i) => {
      if (d.retention === null) return null;
      const x = padL + (data.length > 1 ? (i / (data.length - 1)) * w : w / 2);
      const y = padT + (1 - d.retention) * h;
      return { x, y, i };
    })
    .filter(Boolean) as { x: number; y: number; i: number }[];

  const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.brand} stopOpacity="0.35" />
          <Stop offset="1" stopColor={colors.brand} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {[0, 0.5, 1].map((g, idx) => (
        <Line
          key={idx}
          x1={padL}
          y1={padT + g * h}
          x2={padL + w}
          y2={padT + g * h}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4 6"
        />
      ))}
      {pts.length > 1 && (
        <Path
          d={`M ${pts[0].x},${padT + h} ${poly.split(" ").map((s) => "L " + s.replace(",", " ")).join(" ")} L ${pts[pts.length - 1].x},${padT + h} Z`}
          fill="url(#curveGrad)"
        />
      )}
      {pts.length > 0 && (
        <Polyline points={poly} fill="none" stroke={colors.brand} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {pts.map((p) => (
        <Circle key={p.i} cx={p.x} cy={p.y} r={3.5} fill={colors.brand} stroke={colors.surface} strokeWidth={1.5} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { alignItems: "center", justifyContent: "center", gap: 18 },
  glowDot: {
    shadowColor: colors.brand,
    shadowOpacity: 0.8,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  loaderLabel: { color: colors.onSurfaceSecondary, fontSize: font.base, fontWeight: "600", textAlign: "center", maxWidth: 260 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
