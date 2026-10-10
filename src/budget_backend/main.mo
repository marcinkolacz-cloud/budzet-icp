import Array "mo:base/Array";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Random "mo:base/Random";
import Char "mo:base/Char";
import Nat8 "mo:base/Nat8";
import Timer "mo:base/Timer";
import Buffer "mo:base/Buffer";
import Blob "mo:base/Blob";
import Error "mo:base/Error";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Float "mo:base/Float";
import ExperimentalCycles "mo:base/ExperimentalCycles";

persistent actor Budget {
  public type Kind = { #income; #expense };
  public type Entry = {
    id : Nat;
    owner : Principal;
    kind : Kind;
    title : Text;
    description : Text;
    amountGrosze : Nat;
    created : Int;
  };

  var nextId : Nat = 1;
  var entries : [Entry] = [];

  // stare metody addEntry/listMine/deleteEntry usuniete (nieuzywane); dane `entries` zostaja w pamieci stabilnej

  // --- Magazyn klucz-wartosc per konto (Internet Identity) ---
  public type Rec = { owner : Principal; key : Text; value : Text; rev : Nat };
  public type KvItem = { key : Text; value : Text; rev : Nat };
  var kv : [Rec] = [];

  func okKey(k : Text) : Bool { k.size() > 0 and k.size() <= 64 };

  public shared query (msg) func kvGetAll() : async [KvItem] {
    if (Principal.isAnonymous(msg.caller) or not isMember(msg.caller)) return [];
    let mine = Array.filter<Rec>(kv, func(r) { r.owner == msg.caller });
    Array.map<Rec, KvItem>(mine, func(r) { { key = r.key; value = r.value; rev = r.rev } })
  };

  // expected = rev znany klientowi (0 = klucz jeszcze nie istnieje); niezgodnosc => #err("conflict")
  public shared (msg) func kvPut(key : Text, value : Text, expected : Nat) : async Result.Result<Nat, Text> {
    if (Principal.isAnonymous(msg.caller)) return #err("Wymagane logowanie");
    if (not isMember(msg.caller)) return #err("Brak dostepu");
    if (not okKey(key)) return #err("Nieprawidlowy klucz");
    if (value.size() > 1_000_000) return #err("Za duzo danych");
    var cur : Nat = 0;
    var count : Nat = 0;
    for (r in kv.vals()) {
      if (r.owner == msg.caller) {
        count += 1;
        if (r.key == key) cur := r.rev;
      };
    };
    if (cur != expected) return #err("conflict");
    if (cur == 0 and count >= 20) return #err("Za duzo kluczy");
    let rest = Array.filter<Rec>(kv, func(r) { not (r.owner == msg.caller and r.key == key) });
    kv := Array.append(rest, [{ owner = msg.caller; key = key; value = value; rev = cur + 1 }]);
    #ok(cur + 1)
  };

  // --- Dostep: administratorzy, czlonkowie, kody zaproszen ---
  public type Member = { p : Principal; note : Text; added : Int; by : Principal };
  public type Invite = { code : Text; note : Text; created : Int; expires : Int; usedBy : ?Principal; usedAt : Int };
  public type Access = { member : Bool; admin : Bool; principal : Principal };
  public type MemberView = { p : Principal; note : Text; added : Int; admin : Bool; keys : Nat; bytes : Nat };
  var admins : [Principal] = [];
  var members : [Member] = [];
  var invites : [Invite] = [];

  func isAdmin(p : Principal) : Bool { Array.find<Principal>(admins, func(a) { a == p }) != null };
  func isMember(p : Principal) : Bool {
    isAdmin(p) or Array.find<Member>(members, func(m) { m.p == p }) != null
  };
  func addMemberInt(p : Principal, note : Text, by : Principal) {
    if (Array.find<Member>(members, func(m) { m.p == p }) == null) {
      members := Array.append(members, [{ p = p; note = note; added = Time.now(); by = by }]);
    };
  };

  public shared query (msg) func myAccess() : async Access {
    { member = (not Principal.isAnonymous(msg.caller)) and isMember(msg.caller); admin = isAdmin(msg.caller); principal = msg.caller }
  };

  // pierwszy administrator: wywolanie przez kontrolera canistra (dfx), pozniej takze przez admina
  public shared (msg) func addAdmin(p : Principal) : async Result.Result<Text, Text> {
    if (not (Principal.isController(msg.caller) or isAdmin(msg.caller))) return #err("Brak uprawnien");
    if (Principal.isAnonymous(p)) return #err("Nieprawidlowy principal");
    if (not isAdmin(p)) admins := Array.append(admins, [p]);
    addMemberInt(p, "admin", msg.caller);
    #ok("admin dodany")
  };

  public shared (msg) func removeAdmin(p : Principal) : async Result.Result<Text, Text> {
    if (not (Principal.isController(msg.caller) or isAdmin(msg.caller))) return #err("Brak uprawnien");
    if (admins.size() <= 1 and isAdmin(p)) return #err("Musi zostac co najmniej jeden administrator");
    admins := Array.filter<Principal>(admins, func(a) { a != p });
    #ok("admin usuniety")
  };

  let ALPHA : [Char] = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z','2','3','4','5','6','7','8','9'];

  public shared (msg) func createInvite(note : Text, days : Nat) : async Result.Result<Text, Text> {
    if (not isAdmin(msg.caller)) return #err("Brak uprawnien");
    if (note.size() > 80) return #err("Za dluga notatka");
    if (invites.size() >= 500) return #err("Za duzo kodow - usun stare");
    let b = await Random.blob();
    var code = "";
    var i = 0;
    for (x in b.vals()) {
      if (i < 12) {
        if (i == 4 or i == 8) code #= "-";
        code #= Char.toText(ALPHA[Nat8toNat(x) % 32]);
        i += 1;
      };
    };
    if (days > 3650) return #err("Maksymalnie 3650 dni");
    let now = Time.now();
    let exp : Int = if (days == 0) 0 else now + days * 86_400_000_000_000;
    invites := Array.append(invites, [{ code = code; note = note; created = now; expires = exp; usedBy = null; usedAt = 0 }]);
    #ok(code)
  };

  func Nat8toNat(x : Nat8) : Nat { Nat8.toNat(x) };

  transient var failHour : Int = 0;
  transient var failCount : Nat = 0;
  let HOUR : Int = 3_600_000_000_000;
  func redeemLocked() : Bool { Time.now() / HOUR == failHour and failCount >= 30 };
  func noteFail() {
    let h = Time.now() / HOUR;
    if (h != failHour) { failHour := h; failCount := 0 };
    failCount += 1;
  };

  public shared (msg) func redeemInvite(code : Text) : async Result.Result<Text, Text> {
    if (redeemLocked()) return #err("Za duzo prob - sprobuj za godzine");
    if (Principal.isAnonymous(msg.caller)) return #err("Wymagane logowanie");
    if (isMember(msg.caller)) return #ok("Masz juz dostep");
    if (code.size() > 40) { noteFail(); return #err("Nieprawidlowy kod") };
    let c = Text.toUppercase(Text.trim(code, #char ' '));
    let now = Time.now();
    var found = false;
    var okUse = false;
    var note = "";
    invites := Array.map<Invite, Invite>(invites, func(v) {
      if (v.code == c) {
        found := true;
        if (v.usedBy == null and (v.expires == 0 or v.expires > now)) {
          okUse := true;
          note := v.note;
          { v with usedBy = ?msg.caller; usedAt = now }
        } else v
      } else v
    });
    if (not found) { noteFail(); return #err("Nieprawidlowy kod") };
    if (not okUse) { noteFail(); return #err("Kod zostal juz uzyty lub wygasl") };
    addMemberInt(msg.caller, note, msg.caller);
    #ok("Dostep przyznany")
  };

  public shared query (msg) func listInvites() : async [Invite] {
    if (not isAdmin(msg.caller)) return [];
    invites
  };

  public shared (msg) func deleteInvite(code : Text) : async Result.Result<Text, Text> {
    if (not isAdmin(msg.caller)) return #err("Brak uprawnien");
    invites := Array.filter<Invite>(invites, func(v) { v.code != code });
    #ok("usunieto")
  };

  public shared query (msg) func listMembers() : async [MemberView] {
    if (not isAdmin(msg.caller)) return [];
    // czlonkowie + konta z danymi bez dostepu (np. sprzed wprowadzenia zaproszen)
    var out : [MemberView] = [];
    func stats(p : Principal) : (Nat, Nat) {
      var k = 0; var b = 0;
      for (r in kv.vals()) { if (r.owner == p) { k += 1; b += r.value.size() } };
      (k, b)
    };
    for (m in members.vals()) {
      let (k, b) = stats(m.p);
      out := Array.append(out, [{ p = m.p; note = m.note; added = m.added; admin = isAdmin(m.p); keys = k; bytes = b }]);
    };
    for (r in kv.vals()) {
      if (not isMember(r.owner) and Array.find<MemberView>(out, func(o) { o.p == r.owner }) == null) {
        let (k, b) = stats(r.owner);
        out := Array.append(out, [{ p = r.owner; note = "BEZ DOSTEPU"; added = 0; admin = false; keys = k; bytes = b }]);
      };
    };
    out
  };

  public shared (msg) func addMember(p : Principal, note : Text) : async Result.Result<Text, Text> {
    if (not isAdmin(msg.caller)) return #err("Brak uprawnien");
    if (Principal.isAnonymous(p)) return #err("Nieprawidlowy principal");
    addMemberInt(p, note, msg.caller);
    #ok("dodano")
  };

  // odbiera dostep; dane konta zostaja w canistrze (mozna przywrocic)
  public shared (msg) func removeMember(p : Principal) : async Result.Result<Text, Text> {
    if (not isAdmin(msg.caller)) return #err("Brak uprawnien");
    if (isAdmin(p)) return #err("Najpierw odbierz uprawnienia administratora");
    members := Array.filter<Member>(members, func(m) { m.p != p });
    #ok("dostep odebrany")
  };

  // ===================== STAKING (migracja z NeuronRewardsTracker) =====================
  // Dane globalne (jeden zestaw), zapis tylko dla czlonkow. Sync codziennie 08:00 Europe/Warsaw.
  public type StNeuron = { id : Nat64; name : Text; start : Int; dissolve : Nat64; initStake : Nat64; stake : Nat64 };
  public type StRew = { nid : Nat64; ts : Int; un : Nat64; sm : Nat64; auto : Bool; delta : Int; sd : Nat64; ev : Text };
  public type StWtnPos = { id : Nat; name : Text; start : Int };
  public type StWtn = { pid : Nat; date : Int; nicp : Float; paid : Float; red : Float };
  public type StExt = { chain : Text; day : Text; staked : Nat; pending : Nat; reward : Int; usd : Float; pln : Float; at : Int };
  public type StPrice = { day : Text; icpUsd : Float; icpPln : Float; nearUsd : Float; nearPln : Float; injUsd : Float; injPln : Float };
  public type StSync = { nid : Nat64; ok : Bool; err : Text; at : Int };
  public type StAll = {
    neurons : [StNeuron]; rewards : [StRew]; wtnPos : [StWtnPos]; wtn : [StWtn]; ext : [StExt];
    prices : [StPrice]; sync : [StSync]; lastRun : Int; log : Text; nextRunSec : Nat; hasKey : Bool;
  };

  var stNeurons : [StNeuron] = [];
  var stRewards : [StRew] = [];
  var stWtnPos : [StWtnPos] = [];
  var stWtn : [StWtn] = [];
  var stExt : [StExt] = [];
  var stPrices : [StPrice] = [];
  var stSync : [StSync] = [];
  var stNextWtn : Nat = 1;
  var stCgKey : Text = "";
  var stLastRun : Int = 0;
  var stLog : Text = "";
  transient var stTimer : ?Timer.TimerId = null;
  transient var stNTimer : ?Timer.TimerId = null;
  transient var stManualAt : Int = 0;
  transient var stNeuronAt : Int = 0;

  let ST_MAX_BYTES : Nat64 = 4096;
  let ST_CYCLES : Nat = 1_000_000_000; // nadwyzka wraca do canistra
  let NEAR_ACC = "510c44f041f993fc39d86f2e5e61d512b66b2868f5ff75ee65c4dd00294bd0b3";
  let NEAR_ARGS = "eyJhY2NvdW50X2lkIjoiNTEwYzQ0ZjA0MWY5OTNmYzM5ZDg2ZjJlNWU2MWQ1MTJiNjZiMjg2OGY1ZmY3NWVlNjVjNGRkMDAyOTRiZDBiMyJ9";
  let NEAR_POOLS : [Text] = ["letsnode.poolv1.near", "astro-stakers.poolv1.near", "optimusvalidatornetwork.poolv1.near", "cryptotribe.poolv1.near", "sigmapool.poolv1.near", "allnodes.poolv1.near"];
  let INJ_ACC = "inj1p8z99lcul38vntv8yzfku5vfpk3sesuf4l5n3g";
  let INJ_VAL = "injvaloper10xhy8xurfwts9ckjkq0ga92mrjz9txyygymqzp";

  type HttpHeader = { name : Text; value : Text };
  type HttpResp = { status : Nat; headers : [HttpHeader]; body : Blob };
  type HttpReq = {
    url : Text; max_response_bytes : ?Nat64; headers : [HttpHeader]; body : ?Blob;
    method : { #get; #post; #head };
    transform : ?{ function : shared query ({ response : HttpResp; context : Blob }) -> async HttpResp; context : Blob };
    is_replicated : ?Bool;
  };
  type Gov = actor {
    get_full_neuron : (Nat64) -> async {
      #Ok : { maturity_e8s_equivalent : Nat64; staked_maturity_e8s_equivalent : ?Nat64; auto_stake_maturity : ?Bool; cached_neuron_stake_e8s : Nat64 };
      #Err : { error_type : Int32; error_message : Text };
    };
  };
  transient let IC0 : actor { http_request : HttpReq -> async HttpResp } = actor "aaaaa-aa";
  transient let GOV : Gov = actor "rrkah-fqaaa-aaaaa-aaaaq-cai";

  public query func stTransform(a : { response : HttpResp; context : Blob }) : async HttpResp {
    { status = a.response.status; headers = []; body = a.response.body }
  };

  // httpGetRequestBounded: zawsze jawny limit odpowiedzi (4096 B)
  func httpGetRequestBounded(url : Text, headers : [HttpHeader], post : ?Text) : async Text {
    ExperimentalCycles.add<system>(ST_CYCLES);
    let r = await IC0.http_request({
      url; max_response_bytes = ?ST_MAX_BYTES;
      headers = Array.append([{ name = "User-Agent"; value = "budzet-icp" }], headers);
      body = switch (post) { case (?b) ?Text.encodeUtf8(b); case null null };
      method = switch (post) { case (?_) #post; case null #get };
      transform = ?{ function = stTransform; context = Blob.fromArray([]) };
      is_replicated = ?false;
    });
    if (r.status >= 300) throw Error.reject("HTTP " # Nat.toText(r.status));
    switch (Text.decodeUtf8(r.body)) { case (?t) t; case null "" }
  };

  // --- parsowanie tekstu
  func stFind(h : [Char], n : Text, from : Nat) : ?Nat {
    let nn = Iter.toArray(n.chars());
    if (nn.size() == 0 or h.size() < nn.size()) return null;
    var i = from;
    while (i + nn.size() <= h.size()) {
      var j = 0;
      while (j < nn.size() and h[i + j] == nn[j]) j += 1;
      if (j == nn.size()) return ?i;
      i += 1;
    };
    null
  };
  func isDigit(c : Char) : Bool { c >= '0' and c <= '9' };
  func dval(c : Char) : Nat { Nat32.toNat(Char.toNat32(c) - 48) };
  func stNatAt(h : [Char], from : Nat) : Nat {
    var i = from; var n = 0; var started = false;
    while (i < h.size()) {
      if (isDigit(h[i])) { started := true; n := n * 10 + dval(h[i]) } else if (started) return n;
      i += 1;
    };
    n
  };
  func stFloatAt(h : [Char], from : Nat) : Float {
    var i = from;
    while (i < h.size() and not (isDigit(h[i]) or h[i] == '-')) i += 1;
    var neg = false;
    if (i < h.size() and h[i] == '-') { neg := true; i += 1 };
    var v : Float = 0; var frac = false; var scale : Float = 1;
    label l while (i < h.size()) {
      let c = h[i];
      if (isDigit(c)) {
        if (frac) { scale /= 10; v += Float.fromInt(dval(c)) * scale } else { v := v * 10 + Float.fromInt(dval(c)) };
      } else if (c == '.') { frac := true } else if (c == 'e' or c == 'E') {
        i += 1; var eneg = false;
        if (i < h.size() and (h[i] == '-' or h[i] == '+')) { eneg := h[i] == '-'; i += 1 };
        var e = 0;
        while (i < h.size() and isDigit(h[i])) { e := e * 10 + dval(h[i]); i += 1 };
        v := if (eneg) v / Float.pow(10, Float.fromInt(e)) else v * Float.pow(10, Float.fromInt(e));
        break l;
      } else break l;
      i += 1;
    };
    if (neg) -v else v
  };

  // NEAR RPC: "result":[34,49,...,34] -> bajty ASCII liczby yocto
  func nearYocto(body : Text) : Nat {
    let h = Iter.toArray(body.chars());
    switch (stFind(h, "\"result\":[", 0)) {
      case null 0;
      case (?p) {
        var i = p + 10; var num = 0; var inNum = false; var out = 0; var digits = 0;
        while (i < h.size() and h[i] != ']') {
          if (isDigit(h[i])) { inNum := true; num := num * 10 + dval(h[i]) } else if (inNum) {
            if (num >= 48 and num <= 57) { out := out * 10 + (num - 48 : Nat); digits += 1 };
            inNum := false; num := 0;
          };
          i += 1;
        };
        if (inNum and num >= 48 and num <= 57) { out := out * 10 + (num - 48 : Nat) };
        out
      };
    }
  };
  // Cosmos: suma "amount":"..." (czesc calkowita = jednostki bazowe inj)
  func injAmounts(body : Text) : Nat {
    let h = Iter.toArray(body.chars());
    var total = 0; var from = 0;
    label l loop {
      switch (stFind(h, "\"amount\":", from)) {
        case null break l;
        case (?p) { total += stNatAt(h, p + 9); from := p + 9 };
      };
    };
    total
  };
  func cgPrice(h : [Char], id : Text) : (Float, Float) {
    switch (stFind(h, "\"" # id # "\":{", 0)) {
      case null (0.0, 0.0);
      case (?p) {
        let u = switch (stFind(h, "\"usd\":", p)) { case (?q) stFloatAt(h, q + 6); case null 0.0 };
        let z = switch (stFind(h, "\"pln\":", p)) { case (?q) stFloatAt(h, q + 6); case null 0.0 };
        (u, z)
      };
    }
  };

  // --- daty (UTC dzien, strefa Warszawy dla 08:00)
  func pad2(n : Nat) : Text { if (n < 10) "0" # Nat.toText(n) else Nat.toText(n) };
  func civil(days : Int) : (Int, Nat, Nat) {
    let z = days + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    ((yoe + era * 400) + (if (m <= 2) 1 else 0), Int.abs(m), Int.abs(d))
  };
  func dayKey(ns : Int) : Text {
    let (y, m, d) = civil(ns / 86_400_000_000_000);
    Int.toText(y) # "-" # pad2(m) # "-" # pad2(d)
  };
  // ostatnia niedziela miesiaca (dzien od epoki)
  func lastSunday(y : Int, m : Nat) : Int {
    // dni od epoki dla 1. dnia nastepnego miesiaca, cofamy do niedzieli
    let (ny, nm) = if (m == 12) (y + 1, 1) else (y, m + 1);
    let yy = if (nm <= 2) ny - 1 else ny;
    let era = (if (yy >= 0) yy else yy - 399) / 400;
    let yoe = yy - era * 400;
    let mp : Int = if (nm > 2) nm - 3 else nm + 9;
    let doy = (153 * mp + 2) / 5;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let first = era * 146097 + doe - 719468;
    let last = first - 1;
    let wd = ((last % 7) + 11) % 7; // 0 = niedziela (1970-01-01 = czwartek)
    last - wd
  };
  func warsawOffset(sec : Int) : Int {
    let (y, _, _) = civil(sec / 86_400);
    let s = lastSunday(y, 3) * 86_400 + 3_600; // 01:00 UTC
    let e = lastSunday(y, 10) * 86_400 + 3_600;
    if (sec >= s and sec < e) 7_200 else 3_600
  };
  func secsToNext0800() : Nat { secsToNextAt(8 * 3_600) };
  func secsToNextAt(at : Int) : Nat {
    let now = Time.now() / 1_000_000_000;
    let local = (now + warsawOffset(now)) % 86_400;
    var diff : Int = at - local;
    if (diff <= 60) diff += 86_400;
    Int.abs(diff)
  };

  // --- dostep
  func stCan(p : Principal) : Bool { Principal.isController(p) or ((not Principal.isAnonymous(p)) and isMember(p)) };

  public shared query (msg) func stAll() : async StAll {
    if (not stCan(msg.caller)) return { neurons = []; rewards = []; wtnPos = []; wtn = []; ext = []; prices = []; sync = []; lastRun = 0; log = "Brak dostepu"; nextRunSec = 0; hasKey = false };
    { neurons = stNeurons; rewards = stRewards; wtnPos = stWtnPos; wtn = stWtn; ext = stExt; prices = stPrices; sync = stSync;
      lastRun = stLastRun; log = stLog; nextRunSec = secsToNext0800(); hasKey = stCgKey != "" }
  };

  public shared (msg) func stSetKey(k : Text) : async Result.Result<Text, Text> {
    if (not Principal.isController(msg.caller)) return #err("Tylko kontroler");
    stCgKey := Text.trim(k, #char ' ');
    #ok("klucz zapisany")
  };

  public shared (msg) func stNeuronPut(n : StNeuron) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (n.name.size() > 80) return #err("Za dluga nazwa");
    let ex = Array.find<StNeuron>(stNeurons, func(x) { x.id == n.id });
    let keep = switch (ex) { case (?e) { { n with stake = if (n.stake == 0) e.stake else n.stake } }; case null n };
    if (ex == null and stNeurons.size() >= 50) return #err("Za duzo neuronow");
    stNeurons := Array.append(Array.filter<StNeuron>(stNeurons, func(x) { x.id != n.id }), [keep]);
    #ok("zapisano")
  };

  public shared (msg) func stNeuronRemove(id : Nat64) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    stNeurons := Array.filter<StNeuron>(stNeurons, func(x) { x.id != id });
    stRewards := Array.filter<StRew>(stRewards, func(x) { x.nid != id });
    stSync := Array.filter<StSync>(stSync, func(x) { x.nid != id });
    #ok("usunieto")
  };

  // import partiami; pomija istniejace (nid, ts)
  public shared (msg) func stRewardsImport(rows : [StRew]) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (rows.size() > 2000) return #err("Max 2000 w partii");
    let b = Buffer.fromArray<StRew>(stRewards);
    var added = 0;
    for (r in rows.vals()) {
      if (Array.find<StRew>(stRewards, func(x) { x.nid == r.nid and x.ts == r.ts }) == null) { b.add(r); added += 1 };
    };
    stRewards := Array.sort<StRew>(Buffer.toArray(b), func(a, c) { Int.compare(a.ts, c.ts) });
    #ok(added)
  };

  public shared (msg) func stRewardDelete(nid : Nat64, ts : Int) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    stRewards := Array.filter<StRew>(stRewards, func(x) { not (x.nid == nid and x.ts == ts) });
    #ok("usunieto")
  };

  public shared (msg) func stWtnPosPut(id : Nat, name : Text, start : Int) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (name.size() > 80) return #err("Za dluga nazwa");
    if (id == 0) {
      if (stWtnPos.size() >= 50) return #err("Za duzo pozycji");
      let nid = stNextWtn; stNextWtn += 1;
      stWtnPos := Array.append(stWtnPos, [{ id = nid; name; start }]);
      return #ok(nid);
    };
    if (Array.find<StWtnPos>(stWtnPos, func(x) { x.id == id }) == null) {
      // import z kopii: zachowaj oryginalne id
      stWtnPos := Array.append(stWtnPos, [{ id; name; start }]);
      if (id >= stNextWtn) stNextWtn := id + 1;
    } else {
      stWtnPos := Array.map<StWtnPos, StWtnPos>(stWtnPos, func(x) { if (x.id == id) { { id; name; start } } else x });
    };
    #ok(id)
  };

  public shared (msg) func stWtnPosRemove(id : Nat) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    stWtnPos := Array.filter<StWtnPos>(stWtnPos, func(x) { x.id != id });
    stWtn := Array.filter<StWtn>(stWtn, func(x) { x.pid != id });
    #ok("usunieto")
  };

  // upsert po (pid, date)
  public shared (msg) func stWtnPut(rows : [StWtn]) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (rows.size() > 2000) return #err("Max 2000 w partii");
    var cur = stWtn;
    for (r in rows.vals()) {
      if (Array.find<StWtnPos>(stWtnPos, func(x) { x.id == r.pid }) == null) return #err("Brak pozycji " # Nat.toText(r.pid));
      cur := Array.filter<StWtn>(cur, func(x) { not (x.pid == r.pid and x.date == r.date) });
      cur := Array.append(cur, [r]);
    };
    stWtn := Array.sort<StWtn>(cur, func(a, c) { Int.compare(a.date, c.date) });
    #ok(rows.size())
  };

  public shared (msg) func stWtnDelete(pid : Nat, date : Int) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    stWtn := Array.filter<StWtn>(stWtn, func(x) { not (x.pid == pid and x.date == date) });
    #ok("usunieto")
  };

  // NEAR/INJ historia z kopii; pomija istniejace dni
  public shared (msg) func stExtImport(rows : [StExt]) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (rows.size() > 2000) return #err("Max 2000 w partii");
    let b = Buffer.fromArray<StExt>(stExt);
    var added = 0;
    for (r in rows.vals()) {
      if ((r.chain == "near" or r.chain == "inj") and Array.find<StExt>(stExt, func(x) { x.chain == r.chain and x.day == r.day }) == null) { b.add(r); added += 1 };
    };
    stExt := Buffer.toArray(b);
    #ok(added)
  };

  // --- synchronizacja
  func stLastRew(nid : Nat64) : ?StRew {
    var f : ?StRew = null;
    for (r in stRewards.vals()) { if (r.nid == nid) { switch (f) { case (?x) { if (r.ts >= x.ts) f := ?r }; case null f := ?r } } };
    f
  };
  func stSetSync(nid : Nat64, ok : Bool, err : Text) {
    stSync := Array.append(Array.filter<StSync>(stSync, func(x) { x.nid != nid }), [{ nid; ok; err; at = Time.now() }]);
  };

  func stSyncNeuron(n : StNeuron) : async () {
    try {
      switch (await GOV.get_full_neuron(n.id)) {
        case (#Err e) { stSetSync(n.id, false, e.error_message) };
        case (#Ok g) {
          let un = g.maturity_e8s_equivalent;
          let sm : Nat64 = switch (g.staked_maturity_e8s_equivalent) { case (?v) v; case null 0 };
          let auto = switch (g.auto_stake_maturity) { case (?v) v; case null false };
          let newStake = g.cached_neuron_stake_e8s;
          let prev = stLastRew(n.id);
          let combined : Int = Nat64.toNat(un) + Nat64.toNat(sm);
          let stakeInc : Nat64 = if (n.stake > 0 and newStake > n.stake) newStake - n.stake else 0;
          // scalenie dojrzalosci ze stakiem: spadek unstaked ~ wzrost stake (+-10%)
          let merge = switch (prev) {
            case (?p) {
              let drop : Int = Nat64.toNat(p.un) - Nat64.toNat(un);
              if (drop > 1_000 and stakeInc > 0) {
                let rise = Float.fromInt(Nat64.toNat(stakeInc)); let d = Float.fromInt(drop);
                rise >= d * 0.9 and rise <= d * 1.1
              } else false
            };
            case null false;
          };
          let ev : Text = if (merge) "mergedToStake" else if (stakeInc > 0) "externalTopUp" else "";
          let prevComb : ?Int = switch (prev) { case (?p) ?(Nat64.toNat(p.un) + Nat64.toNat(p.sm)); case null null };
          let skip = ev == "" and prevComb == ?combined;
          if (not skip) {
            let delta : Int = switch (prevComb) { case (?c) combined - c; case null 0 };
            let evf = if (ev != "") ev else switch (prevComb) { case null "firstReading"; case (?_) { if (delta < 0) "disburseOrSpawn" else "normalGrowth" } };
            // max 1 wpis normalGrowth na neuron na dzien: kolejny sync tego dnia nadpisuje (sumuje delte)
            let now = Time.now();
            let same = switch (prev) { case (?p) { evf == "normalGrowth" and p.ev == "normalGrowth" and dayKey(p.ts) == dayKey(now) }; case null false };
            if (same) {
              switch (prev) {
                case (?p) {
                  stRewards := Array.map<StRew, StRew>(stRewards, func(x) {
                    if (x.nid == p.nid and x.ts == p.ts) { { x with ts = now; un; sm; auto; delta = p.delta + delta } } else x
                  });
                };
                case null {};
              };
            } else {
              stRewards := Array.append(stRewards, [{ nid = n.id; ts = now; un; sm; auto; delta; sd = stakeInc; ev = evf }]);
            };
          };
          stNeurons := Array.map<StNeuron, StNeuron>(stNeurons, func(x) {
            if (x.id == n.id) { { x with stake = newStake; initStake = if (x.initStake == 0) newStake else x.initStake } } else x
          });
          stSetSync(n.id, true, "");
        };
      };
    } catch (e) { stSetSync(n.id, false, Error.message(e)) };
  };

  func stLastExt(chain : Text) : ?StExt {
    var f : ?StExt = null;
    for (r in stExt.vals()) { if (r.chain == chain) { switch (f) { case (?x) { if (r.day > x.day) f := ?r }; case null f := ?r } } };
    f
  };
  func stRecordExt(chain : Text, staked : Nat, pending : Nat, usd : Float, pln : Float) {
    let now = Time.now(); let day = dayKey(now);
    let reward : Int = switch (stLastExt(chain)) {
      case null 0;
      case (?p) {
        if (chain == "near") {
          let d : Int = staked - p.staked;
          let base : Int = if (p.day == day) p.reward else 0;
          base + (if (d > 0) d else 0)
        } else {
          let d : Int = pending - p.pending;
          if (p.day == day) { p.reward + (if (d > 0) d else 0) } else if (d >= 0) d else p.pending - pending
        }
      };
    };
    stExt := Array.append(Array.filter<StExt>(stExt, func(x) { not (x.chain == chain and x.day == day) }),
      [{ chain; day; staked; pending; reward; usd; pln; at = now }]);
  };

  func stRun() : async () {
    stLastRun := Time.now();
    var log = "";
    // neurony: osobny timer 18:02 (stNTick) + recznie stSyncNeurons
    var nearP = (0.0, 0.0); var injP = (0.0, 0.0);
    try {
      let hdr = if (stCgKey == "") [] else [{ name = "x-cg-demo-api-key"; value = stCgKey }];
      let b = await httpGetRequestBounded("https://api.coingecko.com/api/v3/simple/price?ids=internet-computer,near,injective-protocol&vs_currencies=usd,pln", hdr, null);
      let h = Iter.toArray(b.chars());
      let icp = cgPrice(h, "internet-computer");
      nearP := cgPrice(h, "near"); injP := cgPrice(h, "injective-protocol");
      if (icp.0 > 0) {
        let day = dayKey(Time.now());
        stPrices := Array.append(Array.filter<StPrice>(stPrices, func(x) { x.day != day }),
          [{ day; icpUsd = icp.0; icpPln = icp.1; nearUsd = nearP.0; nearPln = nearP.1; injUsd = injP.0; injPln = injP.1 }]);
      } else log #= "ceny: brak danych; ";
    } catch (e) { log #= "ceny: " # Error.message(e) # "; " };
    var near = 0; var nearOk = 0;
    for (pool in NEAR_POOLS.vals()) {
      let body = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"" # pool # "\",\"method_name\":\"get_account_total_balance\",\"args_base64\":\"" # NEAR_ARGS # "\"}}";
      try {
        near += nearYocto(await httpGetRequestBounded("https://rpc.mainnet.near.org", [{ name = "Content-Type"; value = "application/json" }], ?body));
        nearOk += 1;
      } catch (e) { log #= pool # ": " # Error.message(e) # "; " };
    };
    if (nearOk == NEAR_POOLS.size() and near > 0) stRecordExt("near", near, 0, nearP.0, nearP.1) else log #= "NEAR: pominieto zapis; ";
    try {
      let base = "https://injective-api.polkachu.com";
      let st = injAmounts(await httpGetRequestBounded(base # "/cosmos/staking/v1beta1/validators/" # INJ_VAL # "/delegations/" # INJ_ACC, [], null));
      let pe = injAmounts(await httpGetRequestBounded(base # "/cosmos/distribution/v1beta1/delegators/" # INJ_ACC # "/rewards/" # INJ_VAL, [], null));
      if (st > 0) stRecordExt("inj", st, pe, injP.0, injP.1) else log #= "INJ: brak stake; ";
    } catch (e) { log #= "INJ: " # Error.message(e) # "; " };
    ignore NEAR_ACC;
    stLog := if (log == "") "OK" else log;
  };

  func stArm<system>() {
    switch (stTimer) { case (?t) Timer.cancelTimer(t); case null {} };
    stTimer := ?Timer.setTimer<system>(#seconds (secsToNext0800()), stTick);
  };
  func stTick() : async () {
    stArm<system>();
    await stRun();
  };
  // auto sync neuronow codziennie 18:02 Europe/Warsaw (NNS Governance, bez outcalli)
  func stNArm<system>() {
    switch (stNTimer) { case (?t) Timer.cancelTimer(t); case null {} };
    stNTimer := ?Timer.setTimer<system>(#seconds (secsToNextAt(18 * 3_600 + 120)), stNTick);
  };
  func stNTick() : async () {
    stNArm<system>();
    stNeuronAt := Time.now();
    for (n in stNeurons.vals()) { await stSyncNeuron(n) };
  };

  // reczny sync: czlonek, max raz na 10 min
  // reczny sync neuronow (NNS Governance, bez outcalli): czlonek, max raz na 10 min
  public shared (msg) func stSyncNeurons() : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (Time.now() - stNeuronAt < 600_000_000_000) return #err("Odczekaj 10 min od poprzedniego syncu neuronow");
    stNeuronAt := Time.now();
    for (n in stNeurons.vals()) { await stSyncNeuron(n) };
    let bad = Array.filter<StSync>(stSync, func(x) { not x.ok }).size();
    #ok(Nat.toText(stNeurons.size() - bad) # "/" # Nat.toText(stNeurons.size()) # " OK")
  };

  public shared (msg) func stSyncNow() : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (Time.now() - stManualAt < 600_000_000_000) return #err("Odczekaj 10 min od poprzedniego syncu");
    stManualAt := Time.now();
    await stRun();
    if (stTimer == null) stArm<system>();
    #ok(stLog)
  };

  system func postupgrade() { stArm<system>(); stNArm<system>() };

  public query func health() : async Text { "ok" };

  system func inspect({
    caller : Principal;
    arg : Blob;
    msg : {
      #addAdmin : () -> Principal;
      #addMember : () -> (Principal, Text);
      #createInvite : () -> (Text, Nat);
      #deleteInvite : () -> Text;
      #health : () -> ();
      #kvGetAll : () -> ();
      #kvPut : () -> (Text, Text, Nat);
      #listInvites : () -> ();
      #listMembers : () -> ();
      #myAccess : () -> ();
      #redeemInvite : () -> Text;
      #removeAdmin : () -> Principal;
      #removeMember : () -> Principal;
      #stAll : () -> ();
      #stNeuronPut : () -> StNeuron;
      #stNeuronRemove : () -> Nat64;
      #stRewardDelete : () -> (Nat64, Int);
      #stRewardsImport : () -> [StRew];
      #stExtImport : () -> [StExt];
      #stSetKey : () -> Text;
      #stSyncNow : () -> ();
      #stSyncNeurons : () -> ();
      #stTransform : () -> { response : HttpResp; context : Blob };
      #stWtnDelete : () -> (Nat, Int);
      #stWtnPosPut : () -> (Nat, Text, Int);
      #stWtnPosRemove : () -> Nat;
      #stWtnPut : () -> [StWtn];
    };
  }) : Bool {
    if (Principal.isAnonymous(caller)) return false;
    switch (msg) {
      case (#redeemInvite _) { arg.size() <= 64 and not redeemLocked() };
      case (#addAdmin _ or #removeAdmin _) { Principal.isController(caller) or isAdmin(caller) };
      case (#addMember _ or #createInvite _ or #deleteInvite _ or #removeMember _ or #listInvites _ or #listMembers _) { isAdmin(caller) };
      case (#kvPut _) { isMember(caller) and arg.size() <= 1_100_000 };
      case (#kvGetAll _) { isMember(caller) };
      case (#stSetKey _) { Principal.isController(caller) };
      case (#stTransform _) { false };
      case (#stRewardsImport _ or #stWtnPut _ or #stExtImport _) { stCan(caller) and arg.size() <= 1_900_000 };
      case (#stAll _ or #stNeuronPut _ or #stNeuronRemove _ or #stRewardDelete _ or #stWtnDelete _ or #stWtnPosPut _ or #stWtnPosRemove _ or #stSyncNow _ or #stSyncNeurons _) { stCan(caller) };
      case (_) { true };
    }
  };
};
