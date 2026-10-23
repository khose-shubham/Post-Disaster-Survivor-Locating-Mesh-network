import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useKavach } from "@/lib/kavach/store";
import { localXY, type Props } from "./MapCanvas";
import type { SensorNode } from "@/lib/kavach/types";

export type SceneSelection = { kind: "node" | "zone" | "signal"; id: string } | null;

export interface Palette {
  sky: string;
  ground: string;
  grid: string;
  concrete: string;
  metal: string;
  water: string;
  primary: string;
  warning: string;
  critical: string;
  info: string;
  success: string;
}

const DEFAULT_PALETTE: Palette = {
  sky: "#080d1a",
  ground: "#0f172a",
  grid: "#1e293b",
  concrete: "#334155",
  metal: "#475569",
  water: "#0284c7",
  primary: "#00f2fe",
  warning: "#f59e0b",
  critical: "#ef4444",
  info: "#38bdf8",
  success: "#10b981",
};

export function palette(): Palette {
  if (typeof window === "undefined") return DEFAULT_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_PALETTE)) {
    const val = styles.getPropertyValue(`--scene-${key}`).trim();
    result[key] = val && val.length > 2 ? val : fallback;
  }
  return result as unknown as Palette;
}

/** Determines node status color according to tactical command standards */
function getNodeStatusColor(n: SensorNode, colors: Palette): string {
  if (n.status === "offline") return colors.critical; // Red: critical / offline
  if (n.status === "degraded" || n.battery < 20) return colors.warning; // Amber: degraded or low battery
  if (n.status === "online") return colors.success; // Green: healthy / online
  return "#64748b"; // Gray: unknown / unavailable
}

/** Multi-story tactical building with floors, window reflections, rooftop equipment */
function TacticalBuilding({
  position,
  width = 6,
  depth = 8,
  height = 5,
  floors = 3,
  tilt = 0,
  label,
  colors,
}: {
  position: [number, number, number];
  width?: number;
  depth?: number;
  height?: number;
  floors?: number;
  tilt?: number;
  label?: string;
  colors: Palette;
}) {
  return (
    <group position={position} rotation={[tilt, 0.25, 0]}>
      {/* Structural building core */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={colors.concrete} roughness={0.88} metalness={0.12} />
      </mesh>

      {/* Floor window bands with reflective tint */}
      {Array.from({ length: floors }, (_, f) => {
        const y = 0.75 + (f * (height - 1)) / floors;
        return (
          <group key={f} position={[0, y, 0]}>
            {/* North/South window bands */}
            <mesh position={[0, 0, depth / 2 + 0.02]}>
              <planeGeometry args={[width * 0.84, 0.52]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.15}
                metalness={0.85}
                emissive="#0284c7"
                emissiveIntensity={0.12}
              />
            </mesh>
            <mesh position={[0, 0, -depth / 2 - 0.02]} rotation-y={Math.PI}>
              <planeGeometry args={[width * 0.84, 0.52]} />
              <meshStandardMaterial color="#0f172a" roughness={0.15} metalness={0.85} />
            </mesh>
            {/* East/West window bands */}
            <mesh position={[width / 2 + 0.02, 0, 0]} rotation-y={Math.PI / 2}>
              <planeGeometry args={[depth * 0.78, 0.52]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.15}
                metalness={0.85}
                emissive="#0284c7"
                emissiveIntensity={0.12}
              />
            </mesh>
            <mesh position={[-width / 2 - 0.02, 0, 0]} rotation-y={-Math.PI / 2}>
              <planeGeometry args={[depth * 0.78, 0.52]} />
              <meshStandardMaterial color="#0f172a" roughness={0.15} metalness={0.85} />
            </mesh>
          </group>
        );
      })}

      {/* Rooftop equipment: HVAC chiller, elevator bulkhead, antenna */}
      <mesh position={[width * 0.18, height + 0.35, depth * 0.15]} castShadow>
        <boxGeometry args={[1.5, 0.7, 1.8]} />
        <meshStandardMaterial color={colors.metal} roughness={0.55} metalness={0.65} />
      </mesh>
      <mesh position={[-width * 0.22, height + 0.9, -depth * 0.2]}>
        <cylinderGeometry args={[0.04, 0.07, 1.8, 6]} />
        <meshStandardMaterial color={colors.metal} metalness={0.8} />
      </mesh>

      {label && (
        <Html
          position={[0, height + 1.2, 0]}
          center
          distanceFactor={35}
          className="pointer-events-none select-none"
        >
          <div className="px-1.5 py-0.5 rounded bg-background/80 border border-border/80 text-[9px] font-mono tracking-wider text-muted-foreground whitespace-nowrap backdrop-blur">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Tilted fractured slabs and rubble fragments for collapse scenarios */
function RubbleField({ colors }: { colors: Palette }) {
  const rubblePieces = useMemo(() => {
    return Array.from({ length: 36 }, (_, i) => ({
      x: -7 + ((i * 3.7) % 13) + Math.sin(i * 1.5) * 0.9,
      y: 0.18 + (i % 3) * 0.12,
      z: -4 + ((i * 2.9) % 9) + Math.cos(i * 1.5) * 0.9,
      rotX: i * 0.85,
      rotY: i * 0.45,
      rotZ: i * 0.22,
      scaleX: 0.5 + (i % 4) * 0.35,
      scaleY: 0.25 + (i % 3) * 0.15,
      scaleZ: 0.5 + (i % 3) * 0.3,
      isMetal: i % 4 === 0,
    }));
  }, []);

  return (
    <group>
      {rubblePieces.map((p, i) => (
        <mesh
          key={`rubble-${i}`}
          position={[p.x, p.y, p.z]}
          rotation={[p.rotX, p.rotY, p.rotZ]}
          castShadow
        >
          <boxGeometry args={[p.scaleX, p.scaleY, p.scaleZ]} />
          <meshStandardMaterial
            color={p.isMetal ? colors.metal : colors.concrete}
            roughness={0.96}
            metalness={p.isMetal ? 0.6 : 0.08}
          />
        </mesh>
      ))}
      {/* Exposed rebar struts protruding from rubble */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={`rebar-${i}`}
          position={[-5 + i * 2, 0.45, -2 + (i % 2) * 1.5]}
          rotation={[0.3, i * 0.6, 0.4]}
        >
          <cylinderGeometry args={[0.02, 0.02, 1.2, 4]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Chemical / fuel storage cylinders with connecting piping for industrial scenario */
function IndustrialFacility({ colors }: { colors: Palette }) {
  return (
    <group position={[4, 0, -8]}>
      {/* Storage Silos */}
      {Array.from({ length: 4 }, (_, i) => (
        <group key={`silo-${i}`} position={[i * 2.5, 0, 0]}>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.95, 0.95, 4, 24]} />
            <meshStandardMaterial color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 4.25, 0]}>
            <coneGeometry args={[0.95, 0.5, 24]} />
            <meshStandardMaterial color={colors.concrete} metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* Overhead interconnecting pipe gantry */}
      <mesh position={[3.75, 3.6, 0]}>
        <boxGeometry args={[8.5, 0.22, 0.22]} />
        <meshStandardMaterial color={colors.concrete} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[3.75, 3.2, 0]}>
        <boxGeometry args={[8.5, 0.15, 0.15]} />
        <meshStandardMaterial color={colors.primary} metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Dynamic water surface with gentle oscillation for flood scenario */
function FloodWater({ colors, reduced }: { colors: Palette; reduced: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current || reduced) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = 0.28 + Math.sin(t * 0.75) * 0.035;
  });

  return (
    <mesh ref={meshRef} position={[0, 0.28, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[36, 28]} />
      <meshPhysicalMaterial
        color={colors.water}
        transparent
        opacity={0.68}
        roughness={0.12}
        metalness={0.35}
        transmission={0.45}
      />
    </mesh>
  );
}

/** Terrain with grid lines, approach roads, and tactical sector boundaries */
function TacticalTerrain({ colors }: { colors: Palette }) {
  const k = useKavach();
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Dark tactical foundation
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, 512, 512);

    // Major coordinates grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Minor telemetry sub-grid
    ctx.lineWidth = 0.65;
    ctx.globalAlpha = 0.25;
    for (let i = 0; i <= 512; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Perimeter boundary lines
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = colors.primary;
    ctx.strokeRect(32, 32, 448, 448);

    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }, [colors]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <>
      {/* Tactical Ground Plane */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[56, 56]} />
        <meshStandardMaterial
          map={texture ?? null}
          color={colors.ground}
          roughness={0.92}
          metalness={0.08}
        />
      </mesh>

      {/* Main Tactical Access Arterial */}
      <mesh position={[0, 0.02, 4.5]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[52, 3.4]} />
        <meshStandardMaterial color="#182234" roughness={0.88} />
      </mesh>

      {/* Road Centerline Dashes */}
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={`dash-${i}`} position={[-24 + i * 3.4, 0.035, 4.5]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1.6, 0.12]} />
          <meshBasicMaterial color="#94a3b8" />
        </mesh>
      ))}

      {/* Structural Complex Buildings */}
      <TacticalBuilding
        position={[-8, 0, -6]}
        width={7}
        depth={8}
        height={5.5}
        floors={3}
        tilt={k.scenario === "collapse" ? 0.16 : 0}
        label="STRUCTURE A"
        colors={colors}
      />
      <TacticalBuilding
        position={[8, 0, 7.5]}
        width={6}
        depth={6.5}
        height={4.2}
        floors={2}
        tilt={k.scenario === "collapse" ? -0.12 : 0}
        label="SECTOR B"
        colors={colors}
      />
      <TacticalBuilding
        position={[-12, 0, 11]}
        width={5.5}
        depth={5}
        height={3.8}
        floors={2}
        label="SECTOR C"
        colors={colors}
      />

      {/* Dynamic Scenario Props */}
      {k.scenario === "collapse" && <RubbleField colors={colors} />}
      {k.scenario === "flood" && <FloodWater colors={colors} reduced={reduced} />}
      {k.scenario === "industrial" && <IndustrialFacility colors={colors} />}
    </>
  );
}

/** Animated LoRa RF packet travelling along mesh path */
function LoRaPacket({
  from,
  to,
  color,
  active,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  active: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (!mesh.current || !active) return;
    t.current = (t.current + Math.min(delta, 0.05) * 0.38) % 1;
    mesh.current.position.lerpVectors(from, to, t.current);
  });

  return active ? (
    <mesh ref={mesh} position={from}>
      <sphereGeometry args={[0.16, 12, 12]} />
      <meshBasicMaterial color={color} />
    </mesh>
  ) : null;
}

/** Rotating radar sweep cone inside estimated search zone */
function RadarSweepSector({
  radius,
  color,
  active,
}: {
  radius: number;
  color: string;
  active: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (mesh.current && active) mesh.current.rotation.z += Math.min(delta, 0.05) * 0.55;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.05, radius, 48, 1, 0, 0.38]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Distinctive communications tower for the Gateway Node (N04) */
function GatewayTower({
  position,
  color,
  label,
  selected,
  onClick,
}: {
  position: THREE.Vector3;
  color: string;
  label: string;
  selected: boolean;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  return (
    <group position={position} onClick={onClick}>
      {/* Heavy Concrete Pad */}
      <mesh position-y={0.1} castShadow receiveShadow>
        <cylinderGeometry args={[0.75, 0.85, 0.2, 6]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Communications Mast Lattice */}
      <mesh position-y={1.4} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 2.4, 4]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Solar Panel Array */}
      <mesh position={[0.3, 1.8, 0]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.6, 0.04, 0.45]} />
        <meshStandardMaterial color="#0284c7" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Omni-directional LoRa Antenna */}
      <mesh position-y={2.8}>
        <cylinderGeometry args={[0.04, 0.05, 1.2, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Active Gateway Top LED */}
      <mesh position-y={3.45}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Ground Perimeter Ring */}
      <mesh position-y={0.02} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.0, 1.2, 32]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>

      {/* Floating Tactical Tag */}
      <Html position={[0, 3.8, 0]} center distanceFactor={30} className="pointer-events-none">
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border backdrop-blur shadow-md whitespace-nowrap ${selected ? "border-primary bg-primary/20 text-primary" : "border-info/40 bg-card/90 text-info"}`}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-bold">{label}</span>
          <span className="text-[8px] px-1 bg-info/15 rounded">GW</span>
        </div>
      </Html>
    </group>
  );
}

/** Field sniffer station 3D model with battery, antenna, and status LED */
function SnifferStation({
  position,
  color,
  label,
  selected,
  battery,
  onClick,
}: {
  position: THREE.Vector3;
  color: string;
  label: string;
  selected: boolean;
  battery: number;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  return (
    <group position={position} onClick={onClick}>
      {/* Rugged Hex Enclosure */}
      <mesh position-y={0.35} castShadow>
        <cylinderGeometry args={[0.38, 0.45, 0.7, 6]} />
        <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.35} />
      </mesh>

      {/* Whip Antenna */}
      <mesh position-y={0.95}>
        <cylinderGeometry args={[0.035, 0.045, 0.9, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Status LED Beacon */}
      <mesh position-y={1.45}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Range Proximity Ring */}
      <mesh position-y={0.02} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.7, 0.85, 32]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>

      {/* Floating Tactical Tag */}
      <Html position={[0, 1.8, 0]} center distanceFactor={30} className="pointer-events-none">
        <div
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border backdrop-blur shadow-md whitespace-nowrap ${selected ? "border-primary bg-primary/20 text-primary" : "border-border bg-card/90 text-foreground"}`}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-bold">{label}</span>
          <span className="text-[9px] text-muted-foreground">{battery.toFixed(0)}%</span>
        </div>
      </Html>
    </group>
  );
}

/** Main 3D Tactical World Renderer */
function TacticalWorld({
  props,
  select,
  colors,
  reduced,
}: {
  props: Props;
  select: (s: SceneSelection) => void;
  colors: Palette;
  reduced: boolean;
}) {
  const k = useKavach();
  const gateway = props.nodes.find((n) => n.type === "gateway");
  const transport = k.gatewayConnected && gateway?.status !== "offline";

  const coords = (n: { lat: number; lon: number }, height = 0) => {
    const xy = localXY(n);
    return new THREE.Vector3(xy.x / 10, height, -xy.y / 10);
  };

  return (
    <>
      {/* Sky and atmospheric distance fog */}
      <color attach="background" args={[colors.sky]} />
      <fog attach="fog" args={[colors.sky, 55, 120]} />

      {/* Tactical directional and ambient illumination */}
      <ambientLight intensity={0.95} />
      <directionalLight
        position={[14, 34, 16]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />

      {/* Terrain and structural models */}
      <TacticalTerrain colors={colors} />

      {/* Sensor Nodes & Gateway */}
      {props.nodes.map((n) => {
        const pos = coords(n, 0);
        const nodeColor = getNodeStatusColor(n, colors);
        const isSelected = props.selectedNode === n.id;

        const handleClick = (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          select({ kind: "node", id: n.id });
          props.onSelectNode?.(n.id);
        };

        if (n.type === "gateway") {
          return (
            <GatewayTower
              key={n.id}
              position={pos}
              color={n.status === "offline" ? colors.critical : colors.info}
              label={n.id}
              selected={isSelected}
              onClick={handleClick}
            />
          );
        }

        return (
          <SnifferStation
            key={n.id}
            position={pos}
            color={nodeColor}
            label={n.id}
            selected={isSelected}
            battery={n.battery}
            onClick={handleClick}
          />
        );
      })}

      {/* LoRa Wireless Mesh Links */}
      {gateway &&
        props.nodes
          .filter((n) => n.id !== gateway.id)
          .map((n) => {
            const from = coords(n, 0.6);
            const to = coords(gateway, 1.4);
            const active = transport && n.status !== "offline";
            const linkColor = active ? colors.primary : colors.critical;

            return (
              <group key={`link-${n.id}`}>
                <Line
                  points={[from, to]}
                  color={linkColor}
                  transparent
                  opacity={active ? 0.45 : 0.6}
                  dashed
                  dashSize={0.4}
                  gapSize={0.3}
                  lineWidth={active ? 1.2 : 1.5}
                />
                <LoRaPacket
                  from={from}
                  to={to}
                  color={colors.primary}
                  active={active && k.running && !reduced}
                />
              </group>
            );
          })}

      {/* Probabilistic Search Zones */}
      {props.zones.map((z) => {
        const zoneCoords = coords(z, 0.16);
        const zoneColor =
          z.priority === "HIGH"
            ? colors.critical
            : z.priority === "MEDIUM"
              ? colors.warning
              : "#64748b";

        return (
          <group
            key={z.id}
            position={zoneCoords}
            onClick={(e) => {
              e.stopPropagation();
              select({ kind: "zone", id: z.id });
            }}
          >
            {/* Inner Probability Disc */}
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[z.radius / 10, 64]} />
              <meshBasicMaterial
                color={zoneColor}
                transparent
                opacity={0.12}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>

            {/* Inner Core Radius Ring */}
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry
                args={[(z.radius * 0.5) / 10 - 0.04, (z.radius * 0.5) / 10 + 0.04, 64]}
              />
              <meshBasicMaterial color={zoneColor} side={THREE.DoubleSide} opacity={0.6} />
            </mesh>

            {/* Outer Confidence Ring (±R) */}
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[z.radius / 10 - 0.06, z.radius / 10 + 0.06, 64]} />
              <meshBasicMaterial color={zoneColor} side={THREE.DoubleSide} />
            </mesh>

            {/* Active Radar Sweep */}
            <RadarSweepSector
              radius={z.radius / 10}
              color={zoneColor}
              active={k.running && !reduced}
            />

            {/* Floating Uncertainty Badge */}
            <Html
              position={[0, 0.4, 0]}
              center
              distanceFactor={32}
              className="pointer-events-none select-none"
            >
              <div className="flex flex-col items-center px-2 py-1 rounded bg-card/95 border border-warning/40 shadow-lg text-[10px] font-mono text-warning whitespace-nowrap backdrop-blur">
                <span className="font-bold">{z.id} · PROBABLE ZONE</span>
                <span className="text-[9px] text-muted-foreground">
                  ±{z.radius} m · {z.confidence}% heuristic
                </span>
              </div>
            </Html>
          </group>
        );
      })}

      {/* Synthetic Ground-Truth Beacon (Simulation Mode Only) */}
      {props.showTruth && k.mode === "simulation" && k.signal && (
        <group
          position={[k.signal.x / 10, 0.7, -k.signal.y / 10]}
          onClick={(e) => {
            e.stopPropagation();
            select({ kind: "signal", id: k.signal?.id ?? "SYN-01" });
          }}
        >
          <mesh>
            <octahedronGeometry args={[0.4]} />
            <meshStandardMaterial
              color={colors.success}
              emissive={colors.success}
              emissiveIntensity={0.65}
            />
          </mesh>
          <Html position={[0, 0.9, 0]} center distanceFactor={30} className="pointer-events-none">
            <span className="px-1.5 py-0.5 rounded bg-success/15 border border-success/40 text-[9px] font-mono text-success whitespace-nowrap backdrop-blur">
              GROUND TRUTH
            </span>
          </Html>
        </group>
      )}

      {/* Orbital Camera Controls */}
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minDistance={18}
        maxDistance={85}
        maxPolarAngle={Math.PI / 2.12}
        enableDamping={!reduced}
      />
    </>
  );
}

export default function DisasterScene({
  props,
  select,
  reset,
}: {
  props: Props;
  select: (s: SceneSelection) => void;
  reset: number;
}) {
  const colors = useMemo(palette, []);
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  return (
    <Canvas
      key={reset}
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [30, 32, 38], fov: 46, near: 0.1, far: 180 }}
      frameloop={reduced ? "demand" : "always"}
      onPointerMissed={() => select(null)}
      aria-label="Interactive TRACE 3D disaster scene"
    >
      <TacticalWorld props={props} select={select} colors={colors} reduced={reduced} />
    </Canvas>
  );
}
