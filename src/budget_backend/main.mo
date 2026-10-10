import Array "mo:base/Array";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Random "mo:base/Random";
import Char "mo:base/Char";
import Nat8 "mo:base/Nat8";

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

  public shared (msg) func addEntry(kind : Kind, title : Text, description : Text, amountGrosze : Nat) : async Result.Result<Entry, Text> {
    if (title == "") return #err("Tytul jest wymagany");
    if (amountGrosze == 0) return #err("Kwota musi byc wieksza od 0");
    let entry : Entry = {
      id = nextId;
      owner = msg.caller;
      kind = kind;
      title = title;
      description = description;
      amountGrosze = amountGrosze;
      created = Time.now();
    };
    nextId += 1;
    entries := Array.append(entries, [entry]);
    #ok(entry)
  };

  public shared query (msg) func listMine() : async [Entry] {
    Array.filter<Entry>(entries, func(e) { e.owner == msg.caller })
  };

  public shared (msg) func deleteEntry(id : Nat) : async Result.Result<Text, Text> {
    let before = entries.size();
    entries := Array.filter<Entry>(entries, func(e) { not (e.id == id and e.owner == msg.caller) });
    if (entries.size() == before) #err("Nie znaleziono wpisu") else #ok("usunieto")
  };


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
    let d = if (days == 0 or days > 365) 7 else days;
    let now = Time.now();
    invites := Array.append(invites, [{ code = code; note = note; created = now; expires = now + d * 86_400_000_000_000; usedBy = null; usedAt = 0 }]);
    #ok(code)
  };

  func Nat8toNat(x : Nat8) : Nat { Nat8.toNat(x) };

  public shared (msg) func redeemInvite(code : Text) : async Result.Result<Text, Text> {
    if (Principal.isAnonymous(msg.caller)) return #err("Wymagane logowanie");
    if (isMember(msg.caller)) return #ok("Masz juz dostep");
    let c = Text.toUppercase(Text.trim(code, #char ' '));
    let now = Time.now();
    var found = false;
    var okUse = false;
    var note = "";
    invites := Array.map<Invite, Invite>(invites, func(v) {
      if (v.code == c) {
        found := true;
        if (v.usedBy == null and v.expires > now) {
          okUse := true;
          note := v.note;
          { v with usedBy = ?msg.caller; usedAt = now }
        } else v
      } else v
    });
    if (not found) return #err("Nieprawidlowy kod");
    if (not okUse) return #err("Kod zostal juz uzyty lub wygasl");
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

  public query func health() : async Text { "ok" };
};
