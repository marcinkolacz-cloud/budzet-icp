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
import Prim "mo:⛔";

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
  var stInjWdH : Nat = 0; // INJ: ostatnia wysokosc bloku z policzonymi wyplatami nagrod (0 = wylaczone)
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
  let INJ_VAL = "injvaloper10xhy8xurfwts9ckjkq0ga92mrjz9txyygymqzp"; // nieuzywane, zostaje dla zgodnosci stable

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
    let r = await (with cycles = ST_CYCLES) IC0.http_request({
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

  // GET z wiekszym limitem odpowiedzi (tx search INJ), nadwyzka cykli wraca
  func httpGetMax(url : Text, maxBytes : Nat64) : async Text {
    let r = await (with cycles = ST_CYCLES * 5) IC0.http_request({
      url; max_response_bytes = ?maxBytes;
      headers = [{ name = "User-Agent"; value = "budzet-icp" }];
      body = null; method = #get;
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
  func injAmounts(body : Text) : Nat { injAmountsAfter(body, "") };
  // suma pol "amount" od miejsca klucza (np. "\"total\":" w rewards, zeby nie liczyc podwojnie)
  func injAmountsAfter(body : Text, key : Text) : Nat {
    let h = Iter.toArray(body.chars());
    var total = 0;
    var from = if (key == "") 0 else switch (stFind(h, key, 0)) { case (?p) p; case null return 0 };
    label l loop {
      switch (stFind(h, "\"amount\":", from)) {
        case null break l;
        case (?p) { total += stNatAt(h, p + 9); from := p + 9 };
      };
    };
    total
  };
  // INJ: suma wyplaconych nagrod (eventy withdraw_rewards, tylko denom inj) + max wysokosc bloku
  // suma wyplat z tx o czasie (UTC ISO) > after; wyplaty sprzed poprzedniego syncu sa juz w jego pending
  func injWithdrawn(body : Text, after : Text) : (Nat, Nat) {
    let h = Array.filter<Char>(Iter.toArray(body.chars()), func(c) { c != ' ' and c != '\n' and c != '\r' and c != '\t' });
    var sum = 0; var maxH = 0; var from = 0;
    label hl loop {
      switch (stFind(h, "\"height\":\"", from)) {
        case null break hl;
        case (?p) { let v = stNatAt(h, p + 10); if (v > maxH) maxH := v; from := p + 10 };
      };
    };
    // segmenty tx: od "timestamp" do nastepnego "timestamp" (eventy sa po timestamp)
    var ts = stFind(h, "\"timestamp\":\"", 0);
    label tl loop {
      switch (ts) {
        case null break tl;
        case (?t) {
          let st = t + 13;
          var iso = ""; var i = st;
          while (i < h.size() and i < st + 19) { iso #= Text.fromChar(h[i]); i += 1 };
          let nextTs = stFind(h, "\"timestamp\":\"", st);
          let end = switch (nextTs) { case (?q) q; case null h.size() };
          if (iso > after) {
            var f = st;
            label wl loop {
              switch (stFind(h, "\"type\":\"withdraw_rewards\"", f)) {
                case null break wl;
                case (?p) {
                  if (p >= end) break wl;
                  f := p + 25;
                  let next = switch (stFind(h, "\"type\":\"", f)) { case (?q) q; case null h.size() };
                  switch (stFind(h, "\"key\":\"amount\",\"value\":\"", f)) {
                    case (?q) { if (q < next and q < end) sum += injCoin(h, q + 24) };
                    case null {};
                  };
                };
              };
            };
          };
          ts := nextTs;
        };
      };
    };
    (sum, maxH)
  };
  func isoUtc(ns : Int) : Text {
    let s = (ns / 1_000_000_000) % 86_400;
    dayKey(ns) # "T" # pad2(Int.abs(s / 3600)) # ":" # pad2(Int.abs((s % 3600) / 60)) # ":" # pad2(Int.abs(s % 60))
  };
  // z "123inj,45peggy0x.." zwraca ilosc inj
  func injCoin(h : [Char], from : Nat) : Nat {
    var i = from;
    while (i < h.size() and h[i] != '\"') {
      var n = 0;
      while (i < h.size() and isDigit(h[i])) { n := n * 10 + dval(h[i]); i += 1 };
      let s = i;
      while (i < h.size() and h[i] != ',' and h[i] != '\"') i += 1;
      if (i - s == 3 and h[s] == 'i' and h[s + 1] == 'n' and h[s + 2] == 'j') return n;
      if (i < h.size() and h[i] == ',') i += 1;
    };
    0
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

  // oznaczenie odczytu jako merge neuronow (nie liczy sie do nagrod) / cofniecie
  public shared (msg) func stRewardToggleMerge(nid : Nat64, ts : Int) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    var out = "";
    stRewards := Array.map<StRew, StRew>(stRewards, func(x) {
      if (x.nid == nid and x.ts == ts) {
        let ev = if (x.ev == "neuronMerge") { if (x.sd > 0) "externalTopUp" else "normalGrowth" } else "neuronMerge";
        out := ev; { x with ev }
      } else x
    });
    if (out == "") #err("brak odczytu") else #ok(out)
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

  // korekta dnia z wyplata rewards (claim przy doplacie): nagroda = wyplacone - pending z poprzedniego dnia + pending dzis
  public shared (msg) func stExtClaim(chain : Text, day : Text, claimed : Nat) : async Result.Result<Text, Text> {
    if (not Principal.isController(msg.caller)) return #err("Tylko kontroler");
    let cur = switch (Array.find<StExt>(stExt, func(x) { x.chain == chain and x.day == day })) { case (?r) r; case null return #err("Brak wpisu " # chain # " " # day) };
    var prev : ?StExt = null;
    for (r in stExt.vals()) { if (r.chain == chain and r.day < day) { switch (prev) { case (?x) { if (r.day > x.day) prev := ?r }; case null prev := ?r } } };
    let pp : Int = switch (prev) { case (?x) x.pending; case null 0 };
    let rw : Int = claimed - pp + cur.pending;
    if (rw < 0) return #err("Wynik ujemny - sprawdz kwote");
    stExt := Array.map<StExt, StExt>(stExt, func(x) { if (x.chain == chain and x.day == day) { { x with reward = rw } } else x });
    #ok("reward " # day # " = " # Int.toText(rw))
  };

  // reczna korekta nagrody dnia (e8/e18 jak w danych)
  public shared (msg) func stExtSetReward(chain : Text, day : Text, reward : Int) : async Result.Result<Text, Text> {
    if (not Principal.isController(msg.caller)) return #err("Tylko kontroler");
    if (Array.find<StExt>(stExt, func(x) { x.chain == chain and x.day == day }) == null) return #err("Brak wpisu");
    stExt := Array.map<StExt, StExt>(stExt, func(x) { if (x.chain == chain and x.day == day) { { x with reward } } else x });
    #ok("ok")
  };
  public query func stExtGet(chain : Text, n : Nat) : async [StExt] {
    let a = Array.filter<StExt>(stExt, func(x) { x.chain == chain });
    let k : Nat = if (a.size() > n) (a.size() - n : Nat) else 0;
    Array.subArray<StExt>(a, k, (a.size() - k : Nat))
  };
  // INJ: start liczenia wyplat nagrod od bloku > h (h = wysokosc tx minus 1; 0 = wylaczone)
  public shared (msg) func stInjWdHeight(h : Nat) : async Result.Result<Text, Text> {
    if (not Principal.isController(msg.caller)) return #err("Tylko kontroler");
    stInjWdH := h;
    #ok("INJ wyplaty liczone od bloku > " # Nat.toText(h))
  };
  public query func stInjWdHeightGet() : async Nat { stInjWdH };

  func stLastExt(chain : Text) : ?StExt {
    var f : ?StExt = null;
    for (r in stExt.vals()) { if (r.chain == chain) { switch (f) { case (?x) { if (r.day > x.day) f := ?r }; case null f := ?r } } };
    f
  };
  func stRecordExt(chain : Text, staked : Nat, pending : Nat, claimed : Nat, usd : Float, pln : Float) {
    let now = Time.now(); let day = dayKey(now);
    let reward : Int = switch (stLastExt(chain)) {
      case null 0;
      case (?p) {
        if (chain == "near") {
          let d : Int = staked - p.staked;
          let base : Int = if (p.day == day) p.reward else 0;
          base + (if (d > 0) d else 0)
        } else {
          // nagroda za okres = pending teraz + wyplacone w okresie - pending z poprzedniego syncu
          let d : Int = pending + claimed - p.pending;
          // d<0 = rewards wyplacone (claim / dopłata do stake) -> liczymy tylko to, co narosło po wyplacie
          if (p.day == day) { p.reward + (if (d >= 0) d else pending) } else if (d >= 0) d else pending
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
    if (nearOk == NEAR_POOLS.size() and near > 0) stRecordExt("near", near, 0, 0, nearP.0, nearP.1) else log #= "NEAR: pominieto zapis; ";
    try {
      let base = "https://injective-api.polkachu.com";
      // wszystkie validatory delegatora (redelegacje bez zmian w kodzie)
      let st = injAmounts(await httpGetRequestBounded(base # "/cosmos/staking/v1beta1/delegations/" # INJ_ACC, [], null));
      let pe = injAmountsAfter(await httpGetRequestBounded(base # "/cosmos/distribution/v1beta1/delegators/" # INJ_ACC # "/rewards", [], null), "\"total\":");
      var claimed = 0; var wdOk = true;
      if (stInjWdH > 0) {
        try {
          // Injective: event withdraw_rewards nie ma atrybutu delegator -> szukamy tx wyslanych przez konto
          // bez filtra wysokosci (publicnode zwraca 0 dla AND); filtr po czasie tx > poprzedni sync w injWithdrawn
          let q = "message.sender%3D%27" # INJ_ACC # "%27";
          // kolejne LCD przy bledzie (sentry bywa 500)
          let path = "/cosmos/tx/v1beta1/txs?query=" # q # "&order_by=ORDER_BY_DESC&page=1&limit=20";
          var body : ?Text = null; var lastErr = "";
          for (h in ["https://sentry.lcd.injective.network", "https://injective-rest.publicnode.com", "https://injective-api.polkachu.com"].vals()) {
            if (body == null) {
              try { body := ?(await httpGetMax(h # path, 300_000)) } catch (e) { lastErr #= Error.message(e) # " "; };
            };
          };
          let (c, mh) = switch (body) { case (?t) injWithdrawn(t, switch (stLastExt("inj")) { case (?p) isoUtc(p.at); case null "" }); case null throw Error.reject(lastErr) };
          claimed := c;
          if (mh > stInjWdH) stInjWdH := mh;
        } catch (e) { wdOk := false; log #= "INJ wyplaty: " # Error.message(e) # "; " };
      };
      if (not wdOk) log #= "INJ: pominieto zapis; "
      else if (st > 0) stRecordExt("inj", st, pe, claimed, injP.0, injP.1) else log #= "INJ: brak stake; ";
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
    // automat pomija puste neurony (stake 0 i dojrzalosc 0 w ostatnim odczycie, np. zrodlo merge); reczny sync czyta wszystkie
    for (n in stNeurons.vals()) { if (not stEmpty(n)) await stSyncNeuron(n) };
    stFixMerges(stNeuronAt);
  };
  // pusty = stake 0, dojrzalosc 0 i brak zmian od 14 dni (NNS dopisuje nagrody zrodlu merge jeszcze kilka dni)
  func stEmpty(n : StNeuron) : Bool {
    n.stake == 0 and (switch (stLastRew(n.id)) { case (?r) r.un == 0 and r.sm == 0 and Time.now() - r.ts > 14 * 86_400_000_000_000; case null false })
  };
  // merge w jednym syncu: zrodlo (stake->0, dojrzalosc ubyla) + cel (wzrost stake) => cel "neuronMerge" bez przeniesionej dojrzalosci, zrodlo "mergeOut"
  func stFixMerges(since : Int) {
    let run = Array.filter<StRew>(stRewards, func(r) { r.ts >= since });
    for (s in run.vals()) {
      let sZero = switch (Array.find<StNeuron>(stNeurons, func(n) { n.id == s.nid })) { case (?n) n.stake == 0; case null false };
      if (s.ev == "disburseOrSpawn" and sZero) {
        // cel: wzrost stake (merge stake+dojrzalosc) albo sam wzrost dojrzalosci >= ubytek zrodla (merge samej dojrzalosci)
        switch (Array.find<StRew>(run, func(t) { t.nid != s.nid and ((t.ev == "externalTopUp" and t.sd > 0) or (t.ev == "normalGrowth" and t.delta + s.delta >= 0)) })) {
          case (?t) {
            stRewards := Array.map<StRew, StRew>(stRewards, func(x) {
              if (x.nid == t.nid and x.ts == t.ts) { { x with ev = if (x.sd > 0) "neuronMerge" else "normalGrowth"; delta = x.delta + s.delta } }
              else if (x.nid == s.nid and x.ts == s.ts) { { x with ev = "mergeOut" } } else x
            });
          };
          case null {};
        };
      };
    };
  };

  // reczny sync: czlonek, max raz na 10 min
  // reczny sync neuronow (NNS Governance, bez outcalli): czlonek, max raz na 10 min
  public shared (msg) func stSyncNeurons() : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (Time.now() - stNeuronAt < 600_000_000_000) return #err("Odczekaj 10 min od poprzedniego syncu neuronow");
    stNeuronAt := Time.now();
    for (n in stNeurons.vals()) { await stSyncNeuron(n) };
    stFixMerges(stNeuronAt);
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

  // ===== Trading Signals: regula T_vt (EMA200 +-2%, rezim BTC, vol-target 60%) =====
  // 1 outcall dziennie 02:30 PL do workera /sig (<=4 KB); mail przez worker /notify tylko przy zmianie sygnalu
  public type SgDay = { day : Text; raw : Text; at : Int };
  public type SgEvent = { id : Nat; day : Text; sym : Text; on : Bool; price : Float; w : Float; mailed : Bool };
  public type SgPos = { id : Nat; sym : Text; status : Text; opened : Text; entry : Float; qty : Float; stop : Float; closed : Text; exit : Float; note : Text; evId : Nat; at : Int };
  public type SgAll = { days : [SgDay]; events : [SgEvent]; pos : [SgPos]; lastRun : Int; log : Text; nextRunSec : Nat; hasKey : Bool; mail : Bool };
  type SgRow = { sym : Text; on : Bool; w : Float; c : Float };
  var sgDays : [SgDay] = [];
  var sgEvents : [SgEvent] = [];
  var sgPos : [SgPos] = [];
  var sgNextId : Nat = 1;
  var sgKey : Text = "";
  var sgMail : Bool = true;
  var sgLastRun : Int = 0;
  var sgLog : Text = "";
  transient var sgTimer : ?Timer.TimerId = null;
  transient var sgManualAt : Int = 0;
  transient var sgMailAt : Int = 0;
  let SG_URL = "https://gielda-quote.marcinkolacz.workers.dev";
  let SG_AT : Int = 2 * 3_600 + 30 * 60;

  func sgF(t : Text) : Float { stFloatAt(Iter.toArray(t.chars()), 0) };
  func sgParse(raw : Text) : (Text, [SgRow]) {
    var day = "";
    let rows = Buffer.Buffer<SgRow>(5);
    for (line in Text.split(raw, #char '\n')) {
      let f = Iter.toArray(Text.split(line, #char '|'));
      if (f.size() == 2 and f[0] == "D") { day := f[1] }
      else if (f.size() >= 4) { rows.add({ sym = f[0]; on = f[1] == "1"; w = sgF(f[2]); c = sgF(f[3]) }) };
    };
    (day, Buffer.toArray(rows))
  };
  func sgHdr() : [HttpHeader] { [{ name = "x-sig-key"; value = sgKey }] };
  func sgSend(txt : Text) : async Text {
    await httpGetRequestBounded(SG_URL # "/notify", Array.append(sgHdr(), [{ name = "Content-Type"; value = "text/plain" }]), ?txt)
  };

  // ===== Boty DEMO: symulowane transakcje wg reguly, wykonywane przy dziennym zapisie sygnalu (bez dodatkowych outcalli) =====
  public type SgBot = { id : Nat; name : Text; syms : [Text]; amount : Float; scale : Bool; fresh : Bool; mode : Text;
    start : Text; endDay : Text; maxEntries : Nat; entries : Nat; active : Bool; note : Text; created : Int };
  public type SgTrade = { id : Nat; bot : Nat; day : Text; sym : Text; buy : Bool; price : Float; qty : Float; usd : Float; fee : Float };
  // wielkosc transakcji (osobny stabilny zapis, rekord SgBot bez zmian): usd = kwota USD, qty = stala ilosc tokenow, all = wszystkie dostepne (reinwestycja)
  public type SgBotCfg = { kind : Text; qty : [(Text, Float)] };
  public type SgBotsAll = { bots : [SgBot]; trades : [SgTrade]; cfg : [(Nat, SgBotCfg)] };
  var sgBotCfg : [(Nat, SgBotCfg)] = [];
  let SG_CFG_USD : SgBotCfg = { kind = "usd"; qty = [] };
  func sgCfg(id : Nat) : SgBotCfg {
    switch (Array.find<(Nat, SgBotCfg)>(sgBotCfg, func(x) { x.0 == id })) { case (?x) x.1; case null SG_CFG_USD }
  };
  func sgQ(c : SgBotCfg, sym : Text) : Float {
    switch (Array.find<(Text, Float)>(c.qty, func(x) { x.0 == sym })) { case (?x) x.1; case null 0 }
  };
  // tryb all: gotowka tokenu = sprzedaze netto - zakupy (bez pierwszego zakupu startowego)
  func sgCash(bot : Nat, sym : Text) : Float {
    var c : Float = 0;
    var first = true;
    for (t in sgTrades.vals()) {
      if (t.bot == bot and t.sym == sym) {
        if (t.buy) { if (first) first := false else c -= t.usd + t.fee } else c += t.usd - t.fee;
      };
    };
    if (c < 0) 0 else c
  };
  var sgBots : [SgBot] = [];
  // ===== Etap 2: prawdziwe zlecenia (mode "real") przez worker /ord; klucze gieldy tylko w workerze =====
  public type SgOrd = { cid : Text; bot : Nat; day : Text; sym : Text; buy : Bool; req : Float; status : Text; tries : Nat; msg : Text; at : Int };
  public type SgLiveAll = { live : Bool; max : Float; orders : [SgOrd]; owner : Bool };
  var sgLive : Bool = false;
  var sgLiveMax : Float = 50;
  var sgOrders : [SgOrd] = [];
  transient var sgExecBusy : Bool = false;
  transient var sgRetryTimer : ?Timer.TimerId = null;
  transient var sgBalAt : Int = 0;
  // operacje na prawdziwych srodkach: tylko kontroler lub admin (nie zwykly czlonek z zaproszenia)
  func sgOwner(p : Principal) : Bool { Principal.isController(p) or isAdmin(p) };
  func sgIsReal(id : Nat) : Bool { switch (Array.find<SgBot>(sgBots, func(x) { x.id == id })) { case (?b) b.mode == "real"; case null false } };
  func sgPending(bot : Nat, sym : Text) : Bool {
    Array.find<SgOrd>(sgOrders, func(o) { o.bot == bot and o.sym == sym and o.status == "pending" }) != null
  };
  func sgQueue(b : SgBot, day : Text, sym : Text, buy : Bool, req : Float, tag : Text) : Text {
    let cid = "b" # Nat.toText(b.id) # "-" # day # "-" # sym # (if (buy) "-B" else "-S") # tag;
    if (Array.find<SgOrd>(sgOrders, func(o) { o.cid == cid }) != null) return "";
    sgOrders := Array.append(sgOrders, [{ cid; bot = b.id; day; sym; buy; req; status = "pending"; tries = 0; msg = ""; at = Time.now() }]);
    if (sgOrders.size() > 2000) sgOrders := Array.subArray(sgOrders, (sgOrders.size() - 2000 : Nat), 2000);
    "Bot " # b.name # " [REAL]: zlecenie " # (if (buy) "KUPNO " # sym # " " # Float.format(#fix 2, req) # " USD" else "SPRZEDAZ " # sym # " " # Float.format(#fix 6, req)) # "\n"
  };
  var sgTrades : [SgTrade] = [];
  let SG_TRADABLE : [Text] = ["ETH", "NEAR", "ICP", "INJ"];
  let SG_FEE : Float = 0.001;

  func sgHeld(bot : Nat, sym : Text) : Float {
    var q : Float = 0;
    for (t in sgTrades.vals()) { if (t.bot == bot and t.sym == sym) { q += if (t.buy) t.qty else -t.qty } };
    if (q < 1e-12) 0 else q
  };
  func sgTrade(b : SgBot, day : Text, sym : Text, buy : Bool, price : Float, qty : Float) : Text {
    let usd = qty * price;
    sgTrades := Array.append(sgTrades, [{ id = sgNextId; bot = b.id; day; sym; buy; price; qty; usd; fee = usd * SG_FEE }]);
    sgNextId += 1;
    "Bot " # b.name # ": " # (if (buy) "KUPNO " else "SPRZEDAZ ") # sym # " " # Float.format(#fix 6, qty) # " @ " # Float.format(#fix 4, price) # " USD\n"
  };
  func sgBotStep(b0 : SgBot, day : Text, rows : [SgRow], prevRows : [SgRow]) : (SgBot, Text) {
    var b = b0;
    var out = "";
    let real = b.mode == "real";
    if (not b.active or (b.mode != "demo" and not real) or (real and not sgLive)) return (b, "");
    let expired = b.endDay != "" and day > b.endDay;
    for (sym in b.syms.vals()) {
      switch (Array.find<SgRow>(rows, func(x) { x.sym == sym })) {
        case (?r) {
          let held = sgHeld(b.id, sym);
          if (real and sgPending(b.id, sym)) {}
          else if (held > 0 and (not r.on or expired)) { out #= if (real) sgQueue(b, day, sym, false, held, "") else sgTrade(b, day, sym, false, r.c, held) }
          else if (held == 0 and r.on and not expired and r.c > 0 and not (b.maxEntries > 0 and b.entries >= b.maxEntries)) {
            let wasOn = switch (Array.find<SgRow>(prevRows, func(x) { x.sym == sym })) { case (?x) x.on; case null true };
            let cfg = sgCfg(b.id);
            let usd = switch (cfg.kind) {
              case ("qty") sgQ(cfg, sym) * r.c * (if (b.scale) r.w else 1.0);
              case ("all") sgCash(b.id, sym) / (1.0 + SG_FEE);
              case (_) b.amount * (if (b.scale) r.w else 1.0);
            };
            if ((not b.fresh or not wasOn) and usd > 0) {
              out #= if (real) sgQueue(b, day, sym, true, Float.min(usd, sgLiveMax), "") else sgTrade(b, day, sym, true, r.c, usd / r.c);
              b := { b with entries = b.entries + 1 };
            };
          };
        };
        case null {};
      };
    };
    let open = Array.filter<Text>(b.syms, func(x) { sgHeld(b.id, x) > 0 or sgPending(b.id, x) }).size();
    if (expired or (b.maxEntries > 0 and b.entries >= b.maxEntries and open == 0)) b := { b with active = false };
    (b, out)
  };
  func sgBotsStep(day : Text, rows : [SgRow], prevRows : [SgRow]) : Text {
    var out = "";
    let nb = Buffer.Buffer<SgBot>(sgBots.size());
    for (b in sgBots.vals()) { let (x, o) = sgBotStep(b, day, rows, prevRows); out #= o; nb.add(x) };
    sgBots := Buffer.toArray(nb);
    out
  };
  func sgLastRows() : (Text, [SgRow], [SgRow]) {
    let n = sgDays.size();
    if (n == 0) return ("", [], []);
    let (d, r) = sgParse(sgDays[n - 1].raw);
    (d, r, if (n > 1) sgParse(sgDays[n - 2].raw).1 else [])
  };

  public shared query (msg) func sgBotsAll() : async SgBotsAll {
    if (not stCan(msg.caller)) return { bots = []; trades = []; cfg = [] };
    { bots = sgBots; trades = sgTrades; cfg = sgBotCfg }
  };

  public shared (msg) func sgBotPut(b : SgBot) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (b.mode == "real" or sgIsReal(b.id)) return #err("Tylko wlasciciel");
    sgBotSave(b, SG_CFG_USD)
  };

  public shared (msg) func sgBotPut2(b : SgBot, c : SgBotCfg) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if ((b.mode == "real" or sgIsReal(b.id)) and not sgOwner(msg.caller)) return #err("Bot REAL: tylko wlasciciel");
    if (c.kind != "usd" and c.kind != "qty" and c.kind != "all") return #err("Zly tryb wielkosci");
    if (c.qty.size() > 4) return #err("Zle ilosci");
    if (b.id == 0 and c.kind != "usd") {
      for (x in b.syms.vals()) { let q = sgQ(c, x); if (not (q > 0 and q <= 1_000_000_000)) return #err("Podaj ilosc dla " # x) };
    };
    let r = sgBotSave(b, c);
    if (b.id == 0 and b.mode == "real") ignore await sgExec();
    r
  };

  func sgBotSave(b : SgBot, c : SgBotCfg) : Result.Result<Nat, Text> {
    if (b.id == 0 and b.mode != "demo" and b.mode != "real") return #err("Zly tryb");
    if (b.id == 0 and b.mode == "real") {
      if (not sgLive) return #err("Prawdziwe zlecenia wylaczone (sgSetLive)");
      if (c.kind == "all") return #err("Tryb REAL: tylko kwota USD lub stala ilosc");
      if (c.kind == "usd" and b.amount > sgLiveMax) return #err("Limit zlecenia " # Float.format(#fix 0, sgLiveMax) # " USD");
      if (Array.filter<SgBot>(sgBots, func(x) { x.mode == "real" and x.active }).size() >= 4) return #err("Limit 4 aktywnych botow REAL");
    };
    if (b.name.size() == 0 or b.name.size() > 40 or b.note.size() > 300 or b.endDay.size() > 10) return #err("Zle dane");
    if (b.syms.size() == 0 or b.syms.size() > 4) return #err("Wybierz 1-4 tokeny");
    for (x in b.syms.vals()) { if (Array.find<Text>(SG_TRADABLE, func(t) { t == x }) == null) return #err("Niedozwolony token: " # x) };
    if (b.id == 0 and c.kind == "usd" and not (b.amount > 0 and b.amount <= 1_000_000)) return #err("Kwota musi byc 0 - 1 000 000 USD");
    if (b.id == 0) {
      if (sgBots.size() >= 20) return #err("Limit 20 botow");
      if (sgTrades.size() >= 20_000) return #err("Limit transakcji");
      let (d, rows, prevRows) = sgLastRows();
      if (d == "") return #err("Brak zapisanego sygnalu - najpierw Odswiez sygnal");
      let nb0 : SgBot = { b with id = sgNextId; start = d; entries = 0; active = true; created = Time.now() };
      sgNextId += 1;
      if (c.kind != "usd") sgBotCfg := Array.append(sgBotCfg, [(nb0.id, c)]);
      if (c.kind == "all" and b.mode == "demo") {
        // pozycja startowa: posiadane tokeny wyceniane po ostatnim zamknieciu (bez prowizji)
        for (x in b.syms.vals()) {
          switch (Array.find<SgRow>(rows, func(r) { r.sym == x })) {
            case (?r) {
              let q = sgQ(c, x);
              if (q > 0 and r.c > 0) {
                sgTrades := Array.append(sgTrades, [{ id = sgNextId; bot = nb0.id; day = d; sym = x; buy = true; price = r.c; qty = q; usd = q * r.c; fee = 0.0 }]);
                sgNextId += 1;
              };
            };
            case null {};
          };
        };
      };
      let (nb, _) = sgBotStep(nb0, d, rows, prevRows);
      sgBots := Array.append(sgBots, [nb]);
      return #ok(nb.id);
    };
    switch (Array.find<SgBot>(sgBots, func(x) { x.id == b.id })) {
      case null #err("Brak bota");
      case (?old) {
        let upd : SgBot = { old with name = b.name; note = b.note; endDay = b.endDay; maxEntries = b.maxEntries };
        sgBots := Array.map<SgBot, SgBot>(sgBots, func(x) { if (x.id == b.id) upd else x });
        #ok(b.id)
      };
    }
  };

  public shared (msg) func sgBotStop(id : Nat, close : Bool) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (sgIsReal(id) and not sgOwner(msg.caller)) return #err("Bot REAL: tylko wlasciciel");
    let (d, rows, _) = sgLastRows();
    var closed = 0;
    let nb = Buffer.Buffer<SgBot>(sgBots.size());
    for (b in sgBots.vals()) {
      if (b.id == id) {
        if (close) {
          for (x in b.syms.vals()) {
            let h = sgHeld(b.id, x);
            if (h > 0 and b.mode == "real") { if (not sgPending(b.id, x)) { ignore sgQueue(b, d, x, false, h, "X" # Nat.toText(Int.abs(Time.now() / 1_000_000_000) % 100_000)); closed += 1 } }
            else if (h > 0) switch (Array.find<SgRow>(rows, func(r) { r.sym == x })) { case (?r) { ignore sgTrade(b, d, x, false, r.c, h); closed += 1 }; case null {} };
          };
        };
        nb.add({ b with active = false });
      } else nb.add(b);
    };
    sgBots := Buffer.toArray(nb);
    let ex = await sgExec();
    #ok((if (closed == 0) "Bot zatrzymany" else "Bot zatrzymany, zamknieto pozycji: " # Nat.toText(closed)) # (if (ex == "") "" else "\n" # ex))
  };

  public shared (msg) func sgBotDelete(id : Nat) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    switch (Array.find<SgBot>(sgBots, func(x) { x.id == id })) {
      case (?b) { if (b.mode == "real") return #err("Bota REAL nie usuwa sie (historia zlecen) - zatrzymaj go") };
      case null {};
    };
    sgBots := Array.filter<SgBot>(sgBots, func(x) { x.id != id });
    sgTrades := Array.filter<SgTrade>(sgTrades, func(t) { t.bot != id });
    sgBotCfg := Array.filter<(Nat, SgBotCfg)>(sgBotCfg, func(x) { x.0 != id });
    #ok("Bot usuniety")
  };

  func sgRun() : async () {
    sgLastRun := Time.now();
    if (sgKey == "") { sgLog := "Brak klucza (sgSetKey)"; return };
    let raw = try { await httpGetRequestBounded(SG_URL # "/sig", sgHdr(), null) } catch (e) { sgLog := "sig: " # Error.message(e); return };
    let (day, rows) = sgParse(raw);
    if (day == "" or rows.size() == 0) { sgLog := "sig: zla odpowiedz"; return };
    let prev : ?SgDay = if (sgDays.size() == 0) null else ?sgDays[sgDays.size() - 1];
    switch (prev) { case (?p) { if (p.day == day) { sgLog := "OK (" # day # " juz zapisany)"; return } }; case null {} };
    sgDays := Array.append(sgDays, [{ day; raw; at = Time.now() }]);
    if (sgDays.size() > 3000) sgDays := Array.subArray(sgDays, (sgDays.size() - 3000 : Nat), 3000);
    let prevRows : [SgRow] = switch (prev) { case (?p) sgParse(p.raw).1; case null [] };
    var botLines = sgBotsStep(day, rows, prevRows);
    botLines #= tbStep(rows);
    let ex = await sgExec();
    if (ex != "") botLines #= ex;
    let botTag = if (botLines == "") "" else " · boty: transakcje";
    if (prevRows.size() == 0) { sgLog := "OK (pierwszy zapis " # day # ")" # botTag; return };
    var subj = "";
    var body = "";
    let evs = Buffer.Buffer<SgEvent>(2);
    for (r in rows.vals()) {
      let was = switch (Array.find<SgRow>(prevRows, func(x) { x.sym == r.sym })) { case (?x) x.on; case null r.on };
      if (was != r.on) {
        evs.add({ id = sgNextId; day; sym = r.sym; on = r.on; price = r.c; w = r.w; mailed = false });
        sgNextId += 1;
        let tag = r.sym # (if (r.on) " ON" else " OFF");
        subj := if (subj == "") tag else subj # ", " # tag;
        body #= (if (r.on) "WEJSCIE (ON): " else "WYJSCIE (OFF): ") # r.sym # " @ " # Float.format(#fix 4, r.c) # " USD"
          # (if (r.on) ", pozycja " # Float.format(#fix 0, r.w * 100) # "% slotu" else "") # "\n";
      };
    };
    if (evs.size() == 0) { sgLog := "OK " # day # " (bez zmian)" # botTag; return };
    var mailed = false;
    if (sgMail) {
      try {
        let res = await sgSend("Trading Signals: " # subj # "\n" # body # (if (botLines == "") "" else "\nBoty:\n" # botLines) # "\nSwieca dzienna " # day # " (zamkniecie 00:00 UTC)\nhttps://57a6w-kiaaa-aaaam-qjmvq-cai.icp0.io/signals.html");
        mailed := Text.startsWith(res, #text "OK");
      } catch (_) {};
    };
    sgEvents := Array.append(sgEvents, Array.map<SgEvent, SgEvent>(Buffer.toArray(evs), func(e) { { e with mailed } }));
    sgLog := "OK " # day # ": " # subj # (if (mailed) " (mail wyslany)" else if (sgMail) " (mail: blad)" else "");
  };

  // wykonanie oczekujacych zlecen: 1 outcall/zlecenie, idempotentne (cid), max 3 proby co 15 min
  func sgExec() : async Text {
    if (sgExecBusy or sgKey == "") return "";
    sgExecBusy := true;
    var out = "";
    for (o in sgOrders.vals()) {
      if (o.status == "pending") {
        let body = o.cid # "|" # o.sym # "|" # (if (o.buy) "BUY|" # Float.format(#fix 2, o.req) else "SELL|" # Float.format(#fix 8, o.req));
        let res = try { await httpGetRequestBounded(SG_URL # "/ord", Array.append(sgHdr(), [{ name = "Content-Type"; value = "text/plain" }]), ?body) } catch (e) { "ERR " # Error.message(e) };
        let f = Iter.toArray(Text.split(res, #char '|'));
        var st = "pending";
        var m = res;
        if (f.size() >= 7 and f[0] == "OK" and (f[2] == "FILLED" or f[2] == "PARTIALLY_FILLED" or f[2] == "EXPIRED") and sgF(f[3]) > 0) {
          let q = sgF(f[3]); let usd = sgF(f[4]);
          sgTrades := Array.append(sgTrades, [{ id = sgNextId; bot = o.bot; day = o.day; sym = o.sym; buy = o.buy; price = usd / q; qty = q; usd; fee = sgF(f[5]) }]);
          sgNextId += 1;
          st := "done"; m := f[2] # " " # f[3] # " @ " # Float.format(#fix 4, usd / q) # " (#" # f[6] # ")";
        } else if (f.size() >= 1 and f[0] == "SKIP") { st := "skip" }
        else if (f.size() >= 1 and f[0] == "WAIT") { st := if (o.tries + 1 >= 10) "error" else "pending" }
        else if (f.size() >= 3 and f[0] == "OK") { st := "error"; m := "Status " # f[2] # " bez wykonania" }
        else if (o.tries + 1 >= 3) { st := "error" };
        sgOrders := Array.map<SgOrd, SgOrd>(sgOrders, func(x) { if (x.cid == o.cid) { { x with status = st; tries = x.tries + 1; msg = m; at = Time.now() } } else x });
        out #= "[REAL] " # o.cid # ": " # st # " - " # m # "\n";
      };
    };
    sgExecBusy := false;
    if (Array.find<SgOrd>(sgOrders, func(x) { x.status == "pending" }) != null) sgRetryArm<system>();
    out
  };
  func sgRetryArm<system>() {
    switch (sgRetryTimer) { case (?t) Timer.cancelTimer(t); case null {} };
    sgRetryTimer := ?Timer.setTimer<system>(#seconds 900, sgRetryTick);
  };
  func sgRetryTick() : async () {
    sgRetryTimer := null;
    let ex = await sgExec();
    if (ex != "" and sgMail) { try { ignore await sgSend("Trading Signals: zlecenia REAL\n" # ex) } catch (_) {} };
  };

  public shared query (msg) func sgLiveAll() : async SgLiveAll {
    if (not stCan(msg.caller)) return { live = false; max = 0; orders = []; owner = false };
    let n = sgOrders.size();
    { live = sgLive; max = sgLiveMax; orders = if (n > 300) Array.subArray(sgOrders, (n - 300 : Nat), 300) else sgOrders; owner = sgOwner(msg.caller) }
  };

  public shared (msg) func sgSetLive(on : Bool, max : Float) : async Result.Result<Text, Text> {
    if (not Principal.isController(msg.caller)) return #err("Tylko kontroler");
    if (not (max >= 5 and max <= 10_000)) return #err("Limit 5 - 10 000 USD");
    sgLive := on; sgLiveMax := max;
    #ok("REAL " # (if (on) "WLACZONE" else "WYLACZONE") # ", limit zlecenia " # Float.format(#fix 0, max) # " USD")
  };

  public shared (msg) func sgOrdRetry() : async Result.Result<Text, Text> {
    if (not sgOwner(msg.caller)) return #err("Tylko wlasciciel");
    let r = await sgExec();
    #ok(if (r == "") "Brak oczekujacych zlecen" else r)
  };

  public shared (msg) func sgBalance() : async Result.Result<Text, Text> {
    if (not sgOwner(msg.caller)) return #err("Tylko wlasciciel");
    if (sgKey == "") return #err("Brak klucza (sgSetKey)");
    if (Time.now() - sgBalAt < 60_000_000_000) return #err("Odczekaj 1 min");
    sgBalAt := Time.now();
    try { #ok(await httpGetRequestBounded(SG_URL # "/bal", sgHdr(), null)) } catch (e) { #err(Error.message(e)) }
  };

  // ===== Terminal sprzedazy: auto-sprzedaz REAL (OKX) raz w tygodniu wg progow; zlecenia i transakcje z bot = 0 =====
  public type TbPlan = { sym : Text; lv : [(Float, Float)]; tot : Float; on : Bool; at : Int };
  public type TbAll = { plans : [TbPlan]; sales : [SgTrade]; orders : [SgOrd]; live : Bool; owner : Bool };
  var tbPlans : [TbPlan] = [];
  func tbWeek() : Text { Int.toText((Time.now() / 86_400_000_000_000 + 3) / 7) };
  func tbSold(sym : Text) : Float {
    var q : Float = 0;
    for (t in sgTrades.vals()) { if (t.bot == 0 and t.sym == sym and not t.buy) q += t.qty };
    q
  };
  func tbStep(rows : [SgRow]) : Text {
    if (not sgLive) return "";
    let wk = tbWeek();
    let day = dayKey(Time.now());
    var out = "";
    for (p in tbPlans.vals()) {
      let cid = "t-" # p.sym # "-w" # wk;
      if (p.on and not sgPending(0, p.sym) and Array.find<SgOrd>(sgOrders, func(o) { o.cid == cid }) == null) {
        switch (Array.find<SgRow>(rows, func(x) { x.sym == p.sym })) {
          case (?r) {
            var best : Float = -1;
            var q : Float = 0;
            for ((px, qq) in p.lv.vals()) { if (px > 0 and r.c >= px and px > best) { best := px; q := qq } };
            if (p.tot > 0) q := Float.min(q, p.tot - tbSold(p.sym));
            if (q > 0) {
              sgOrders := Array.append(sgOrders, [{ cid; bot = 0; day; sym = p.sym; buy = false; req = q; status = "pending"; tries = 0; msg = ""; at = Time.now() }]);
              out #= "Terminal [REAL]: SPRZEDAZ " # p.sym # " " # Float.format(#fix 4, q) # " (cena " # Float.format(#fix 4, r.c) # ", prog " # Float.format(#fix 4, best) # ")\n";
            };
          };
          case null {};
        };
      };
    };
    out
  };
  public shared query (msg) func tbAll() : async TbAll {
    if (not sgOwner(msg.caller)) return { plans = []; sales = []; orders = []; live = false; owner = false };
    { plans = tbPlans; sales = Array.filter<SgTrade>(sgTrades, func(t) { t.bot == 0 }); orders = Array.filter<SgOrd>(sgOrders, func(o) { o.bot == 0 }); live = sgLive; owner = true }
  };
  public shared (msg) func tbPut(p : TbPlan) : async Result.Result<Text, Text> {
    if (not sgOwner(msg.caller)) return #err("Tylko wlasciciel");
    if (Array.find<Text>(SG_TRADABLE, func(x) { x == p.sym }) == null) return #err("Auto tylko dla ETH, NEAR, ICP, INJ");
    if (p.lv.size() == 0 or p.lv.size() > 20) return #err("Progi: 1-20");
    for ((px, qq) in p.lv.vals()) { if (not (px > 0 and qq > 0)) return #err("Zly prog") };
    if (not (p.tot >= 0)) return #err("Zla pula");
    tbPlans := Array.append(Array.filter<TbPlan>(tbPlans, func(x) { x.sym != p.sym }), [{ p with at = Time.now() }]);
    #ok("Auto " # p.sym # (if (p.on) " WLACZONE" else " WYLACZONE"))
  };

  func sgArm<system>() {
    switch (sgTimer) { case (?t) Timer.cancelTimer(t); case null {} };
    sgTimer := ?Timer.setTimer<system>(#seconds (secsToNextAt(SG_AT)), sgTick);
  };
  func sgTick() : async () {
    sgArm<system>();
    await sgRun();
  };

  public shared query (msg) func sgAll() : async SgAll {
    if (not stCan(msg.caller)) return { days = []; events = []; pos = []; lastRun = 0; log = "Brak dostepu"; nextRunSec = 0; hasKey = false; mail = false };
    let n = sgDays.size();
    { days = if (n > 400) Array.subArray(sgDays, (n - 400 : Nat), 400) else sgDays; events = sgEvents; pos = sgPos;
      lastRun = sgLastRun; log = sgLog; nextRunSec = secsToNextAt(SG_AT); hasKey = sgKey != ""; mail = sgMail }
  };

  public shared (msg) func sgSetKey(k : Text) : async Result.Result<Text, Text> {
    if (not Principal.isController(msg.caller)) return #err("Tylko kontroler");
    sgKey := Text.trim(k, #char ' ');
    if (sgTimer == null) sgArm<system>();
    #ok(if (sgKey == "") "Klucz usuniety" else "Klucz zapisany")
  };

  public shared (msg) func sgSetMail(on : Bool) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    sgMail := on;
    #ok(if (on) "Maile wlaczone" else "Maile wylaczone")
  };

  public shared (msg) func sgRunNow() : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (Time.now() - sgManualAt < 600_000_000_000) return #err("Odczekaj 10 min od poprzedniego odswiezenia");
    sgManualAt := Time.now();
    await sgRun();
    if (sgTimer == null) sgArm<system>();
    #ok(sgLog)
  };

  public shared (msg) func sgTestMail() : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (sgKey == "") return #err("Brak klucza (sgSetKey)");
    if (Time.now() - sgMailAt < 600_000_000_000) return #err("Odczekaj 10 min od poprzedniego testu");
    sgMailAt := Time.now();
    try { #ok(await sgSend("Trading Signals: test\nTest alertu z canistra budzetu. Jesli to czytasz, alerty dzialaja.")) } catch (e) { #err(Error.message(e)) }
  };

  public shared (msg) func sgPosPut(p : SgPos) : async Result.Result<Nat, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    if (p.sym.size() == 0 or p.sym.size() > 10 or p.status.size() > 10 or p.note.size() > 500 or p.opened.size() > 10 or p.closed.size() > 10) return #err("Zle dane");
    if (p.id == 0) {
      if (sgPos.size() >= 1000) return #err("Limit 1000 pozycji");
      let id = sgNextId;
      sgNextId += 1;
      sgPos := Array.append(sgPos, [{ p with id; at = Time.now() }]);
      return #ok(id);
    };
    if (Array.find<SgPos>(sgPos, func(x) { x.id == p.id }) == null) return #err("Brak pozycji");
    sgPos := Array.map<SgPos, SgPos>(sgPos, func(x) { if (x.id == p.id) { { p with at = Time.now() } } else x });
    #ok(p.id)
  };

  public shared (msg) func sgPosDelete(id : Nat) : async Result.Result<Text, Text> {
    if (not stCan(msg.caller)) return #err("Brak dostepu");
    sgPos := Array.filter<SgPos>(sgPos, func(x) { x.id != id });
    #ok("Usunieto")
  };

  public shared query (msg) func dbgMem() : async Text {
    if (not Principal.isController(msg.caller)) return "Tylko kontroler";
    var kvB = 0; for (r in kv.vals()) kvB += r.value.size();
    var dB = 0; for (d in sgDays.vals()) dB += d.raw.size();
    "heap=" # Nat.toText(Prim.rts_heap_size()) # " mem=" # Nat.toText(Prim.rts_memory_size())
    # " alloc=" # Nat.toText(Prim.rts_total_allocation()) # " reclaimed=" # Nat.toText(Prim.rts_reclaimed())
    # "\nkv=" # Nat.toText(kv.size()) # "/" # Nat.toText(kvB) # "B sgDays=" # Nat.toText(sgDays.size()) # "/" # Nat.toText(dB) # "B"
    # " sgEvents=" # Nat.toText(sgEvents.size()) # " sgTrades=" # Nat.toText(sgTrades.size()) # " sgOrders=" # Nat.toText(sgOrders.size())
    # " stRewards=" # Nat.toText(stRewards.size()) # " stExt=" # Nat.toText(stExt.size()) # " stPrices=" # Nat.toText(stPrices.size())
    # " stWtn=" # Nat.toText(stWtn.size()) # " sgLog=" # Nat.toText(sgLog.size()) # " stLog=" # Nat.toText(stLog.size())
  };

  system func postupgrade() { stArm<system>(); stNArm<system>(); sgArm<system>() };

  public query func health() : async Text { "ok" };

  system func inspect({
    caller : Principal;
    arg : Blob;
    msg : {
      #addAdmin : () -> Principal;
      #addMember : () -> (Principal, Text);
      #createInvite : () -> (Text, Nat);
      #dbgMem : () -> ();
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
      #sgAll : () -> ();
      #sgBotDelete : () -> Nat;
      #sgBotPut : () -> SgBot;
      #sgBotPut2 : () -> (SgBot, SgBotCfg);
      #sgBotStop : () -> (Nat, Bool);
      #sgBotsAll : () -> ();
      #sgLiveAll : () -> ();
      #tbAll : () -> ();
      #tbPut : () -> TbPlan;
      #sgSetLive : () -> (Bool, Float);
      #sgOrdRetry : () -> ();
      #sgBalance : () -> ();
      #sgPosDelete : () -> Nat;
      #sgPosPut : () -> SgPos;
      #sgRunNow : () -> ();
      #sgSetKey : () -> Text;
      #sgSetMail : () -> Bool;
      #sgTestMail : () -> ();
      #stNeuronPut : () -> StNeuron;
      #stNeuronRemove : () -> Nat64;
      #stRewardDelete : () -> (Nat64, Int);
      #stRewardToggleMerge : () -> (Nat64, Int);
      #stRewardsImport : () -> [StRew];
      #stExtImport : () -> [StExt];
      #stExtClaim : () -> (Text, Text, Nat);
      #stExtGet : () -> (Text, Nat);
      #stExtSetReward : () -> (Text, Text, Int);
      #stInjWdHeight : () -> Nat;
      #stInjWdHeightGet : () -> ();
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
      case (#sgSetKey _ or #sgSetLive _) { Principal.isController(caller) };
      case (#sgLiveAll _) { stCan(caller) };
      case (#sgOrdRetry _ or #sgBalance _) { Principal.isController(caller) or isAdmin(caller) };
      case (#tbAll _) { Principal.isController(caller) or isAdmin(caller) };
      case (#stInjWdHeight _) { Principal.isController(caller) };
      case (#stExtClaim _) { Principal.isController(caller) and arg.size() <= 500 };
      case (#stExtSetReward _) { Principal.isController(caller) and arg.size() <= 500 };
      case (#stExtGet _) { true };
      case (#tbPut _) { (Principal.isController(caller) or isAdmin(caller)) and arg.size() <= 2_000 };
      case (#sgBotPut _ or #sgBotPut2 _) { stCan(caller) and arg.size() <= 2_000 };
      case (#sgBotsAll _ or #sgBotStop _ or #sgBotDelete _) { stCan(caller) };
      case (#sgPosPut _) { stCan(caller) and arg.size() <= 4_000 };
      case (#sgAll _ or #sgPosDelete _ or #sgRunNow _ or #sgSetMail _ or #sgTestMail _) { stCan(caller) };
      case (#stTransform _) { false };
      case (#stRewardsImport _ or #stWtnPut _ or #stExtImport _) { stCan(caller) and arg.size() <= 1_900_000 };
      case (#stAll _ or #stNeuronPut _ or #stNeuronRemove _ or #stRewardDelete _ or #stRewardToggleMerge _ or #stWtnDelete _ or #stWtnPosPut _ or #stWtnPosRemove _ or #stSyncNow _ or #stSyncNeurons _) { stCan(caller) };
      case (_) { true };
    }
  };
};
