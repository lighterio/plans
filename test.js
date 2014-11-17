var e, eN, e0;

for (var i = 0; i < 10; i++) {
  var e = {};
  eN = (e0 ? (eN._N = e) : (e0 = e));
}

var a = [e0];
var n = e0._N;
while (n && (a.length < 100)) {
  a.push(n);
  n = n._N;
}

console.log(a);
