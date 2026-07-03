import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../theme/bronze.css";
import { TooltipProvider } from "../hud/Tooltip";
import { CampaignTopBar, type CampaignTopBarProps } from "./CampaignTopBar";
import { ArmyPanel, type ArmyPanelProps } from "./ArmyPanel";
import { CityPanel, type CityPanelProps } from "./CityPanel";
import { DiplomacyPanel, type DiplomacyPanelProps } from "./DiplomacyPanel";
import { ClassBuilder, type ClassBuilderProps } from "./ClassBuilder";
import { CampaignBattleModal, type CampaignBattleModalProps } from "./CampaignBattleModal";
import { Sieges, type SiegeRow } from "./Sieges";
import { MapCards, type MapCardModel, type MapCardPosition, type MapCardsHandle } from "./MapCards";

export interface CampaignHudHandle {
  setMapCards(cards: MapCardModel[]): void;
  updateMapCards(positions: MapCardPosition[]): void;
  measureMapCards(): Map<string, { w: number; h: number }>;
  setTopBar(props: CampaignTopBarProps): void;
  setArmy(props: ArmyPanelProps | null): void;
  setCity(props: CityPanelProps | null): void;
  setJunction(name: string): void;
  setDiplomacy(props: DiplomacyPanelProps | null): void;
  setClasses(props: ClassBuilderProps | null): void;
  setSieges(sieges: SiegeRow[], onSelect: (node: number, x: number, y: number) => void): void;
  setBattleModal(props: CampaignBattleModalProps | null): void;
  setProgressModal(text: string | null): void;
  destroy(): void;
}

interface TopBarHandle {
  set(props: CampaignTopBarProps): void;
}

const TopBarHost = forwardRef<TopBarHandle>(function TopBarHost(_props, ref) {
  const [props, setProps] = useState<CampaignTopBarProps | null>(null);
  useImperativeHandle(ref, () => ({ set: (p) => flushSync(() => setProps(p)) }), []);
  return <div id="cmp-topbar-root">{props ? <CampaignTopBar {...props} /> : null}</div>;
});

interface ArmyHandle {
  set(props: ArmyPanelProps | null): void;
}

const ArmyHost = forwardRef<ArmyHandle>(function ArmyHost(_props, ref) {
  const [props, setProps] = useState<ArmyPanelProps | null>(null);
  useImperativeHandle(ref, () => ({ set: (p) => flushSync(() => setProps(p)) }), []);
  return (
    <div
      id="cmp-army"
      className="cmp-panel hud-chassis renderer-campaign-panel army"
      style={{ display: props ? "block" : "none" }}
    >
      {props ? <ArmyPanel {...props} /> : null}
    </div>
  );
});

interface CityHandle {
  set(props: CityPanelProps | null): void;
  setJunction(name: string): void;
}

const CityHost = forwardRef<CityHandle>(function CityHost(_props, ref) {
  const [content, setContent] = useState<ReactNode | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      set: (p) => flushSync(() => setContent(p ? <CityPanel {...p} /> : null)),
      setJunction: (name) =>
        flushSync(() =>
          setContent(
            <div className="cmp-title">
              <b>{name}</b>
              <span className="cmp-city-meta">(junction)</span>
            </div>,
          ),
        ),
    }),
    [],
  );
  return (
    <div
      id="cmp-city"
      className="cmp-panel cmp-panel--city hud-chassis renderer-campaign-panel city"
      style={{ display: content ? "block" : "none" }}
    >
      {content}
    </div>
  );
});

interface DiplomacyHandle {
  set(props: DiplomacyPanelProps | null): void;
}

const DiplomacyHost = forwardRef<DiplomacyHandle>(function DiplomacyHost(_props, ref) {
  const [props, setProps] = useState<DiplomacyPanelProps | null>(null);
  useImperativeHandle(ref, () => ({ set: (p) => flushSync(() => setProps(p)) }), []);
  return (
    <div
      id="cmp-diplomacy"
      className="cmp-panel cmp-panel--diplomacy hud-chassis renderer-campaign-panel diplomacy"
      style={{ display: props ? "block" : "none" }}
    >
      {props ? <DiplomacyPanel {...props} /> : null}
    </div>
  );
});

interface ClassesHandle {
  set(props: ClassBuilderProps | null): void;
}

const ClassesHost = forwardRef<ClassesHandle>(function ClassesHost(_props, ref) {
  const [props, setProps] = useState<ClassBuilderProps | null>(null);
  useImperativeHandle(ref, () => ({ set: (p) => flushSync(() => setProps(p)) }), []);
  return (
    <div
      id="cmp-classes"
      className="cmp-panel cmp-panel--classes hud-chassis hud-chassis--tray renderer-campaign-panel classes"
      style={{ display: props ? "block" : "none" }}
    >
      {props ? <ClassBuilder {...props} /> : null}
    </div>
  );
});

interface SiegesHandle {
  set(sieges: SiegeRow[], onSelect: (node: number, x: number, y: number) => void): void;
}

const SiegesHost = forwardRef<SiegesHandle>(function SiegesHost(_props, ref) {
  const [props, setProps] = useState<{
    sieges: SiegeRow[];
    onSelect: (node: number, x: number, y: number) => void;
  }>({ sieges: [], onSelect: () => {} });
  useImperativeHandle(
    ref,
    () => ({
      set: (sieges, onSelect) => flushSync(() => setProps({ sieges, onSelect })),
    }),
    [],
  );
  return (
    <div className="cmp-sieges" id="cmp-sieges">
      <Sieges {...props} />
    </div>
  );
});

interface ModalHandle {
  setBattle(props: CampaignBattleModalProps | null): void;
  setProgress(text: string | null): void;
}

const ModalHost = forwardRef<ModalHandle>(function ModalHost(_props, ref) {
  const [battle, setBattle] = useState<CampaignBattleModalProps | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      setBattle: (p) =>
        flushSync(() => {
          setBattle(p);
          if (p) setProgress(null);
        }),
      setProgress: (text) =>
        flushSync(() => {
          setProgress(text);
          if (text) setBattle(null);
        }),
    }),
    [],
  );
  return (
    <div id="cmp-modal-root">
      {battle ? <CampaignBattleModal {...battle} /> : null}
      {progress ? (
        <div className="cmp-modal">
          <div className="cmp-box hud-chassis hud-chassis--tray">
            <h2>Resolving battle...</h2>
            <div id="cmp-prog">{progress}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

type CampaignHudInnerHandle = Omit<CampaignHudHandle, "destroy">;

const CampaignHud = forwardRef<CampaignHudInnerHandle>(function CampaignHud(_props, ref) {
  const topBarRef = useRef<TopBarHandle>(null);
  const armyRef = useRef<ArmyHandle>(null);
  const cityRef = useRef<CityHandle>(null);
  const diplomacyRef = useRef<DiplomacyHandle>(null);
  const classesRef = useRef<ClassesHandle>(null);
  const siegesRef = useRef<SiegesHandle>(null);
  const modalRef = useRef<ModalHandle>(null);
  const mapCardsRef = useRef<MapCardsHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      setMapCards: (cards) => mapCardsRef.current?.set(cards),
      updateMapCards: (positions) => mapCardsRef.current?.update(positions),
      measureMapCards: () => mapCardsRef.current?.measure() ?? new Map(),
      setTopBar: (p) => topBarRef.current?.set(p),
      setArmy: (p) => armyRef.current?.set(p),
      setCity: (p) => cityRef.current?.set(p),
      setJunction: (name) => cityRef.current?.setJunction(name),
      setDiplomacy: (p) => diplomacyRef.current?.set(p),
      setClasses: (p) => classesRef.current?.set(p),
      setSieges: (sieges, onSelect) => siegesRef.current?.set(sieges, onSelect),
      setBattleModal: (p) => modalRef.current?.setBattle(p),
      setProgressModal: (text) => modalRef.current?.setProgress(text),
    }),
    [],
  );
  return (
    <TooltipProvider>
      <MapCards ref={mapCardsRef} />
      <TopBarHost ref={topBarRef} />
      <ArmyHost ref={armyRef} />
      <CityHost ref={cityRef} />
      <SiegesHost ref={siegesRef} />
      <DiplomacyHost ref={diplomacyRef} />
      <ClassesHost ref={classesRef} />
      <ModalHost ref={modalRef} />
    </TooltipProvider>
  );
});

export function mountCampaignHud(container: HTMLElement): CampaignHudHandle {
  const root = createRoot(container);
  let inner: CampaignHudInnerHandle | null = null;
  const capture: Ref<CampaignHudInnerHandle> = (h) => {
    inner = h;
  };
  flushSync(() => {
    root.render(<CampaignHud ref={capture} />);
  });
  return Object.assign(inner!, { destroy: () => root.unmount() });
}
