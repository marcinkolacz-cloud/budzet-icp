import Array "mo:base/Array";
import Result "mo:base/Result";
import Time "mo:base/Time";

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

  public query func health() : async Text { "ok" };
};
