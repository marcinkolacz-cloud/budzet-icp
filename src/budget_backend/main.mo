import Array "mo:base/Array";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Text "mo:base/Text";

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
    if (Principal.isAnonymous(msg.caller)) return [];
    let mine = Array.filter<Rec>(kv, func(r) { r.owner == msg.caller });
    Array.map<Rec, KvItem>(mine, func(r) { { key = r.key; value = r.value; rev = r.rev } })
  };

  // expected = rev znany klientowi (0 = klucz jeszcze nie istnieje); niezgodnosc => #err("conflict")
  public shared (msg) func kvPut(key : Text, value : Text, expected : Nat) : async Result.Result<Nat, Text> {
    if (Principal.isAnonymous(msg.caller)) return #err("Wymagane logowanie");
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

  public query func health() : async Text { "ok" };
};
