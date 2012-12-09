#include <stdio.h>

static const double B1 = 1.0 / 6.0;
static const double B3 = -1.0 / 30.0;
static const double B5 = 1.0 / 42.0;

// To make the programs match as closely as possible use this macro for
// instructions to the order of input, op, and output are the same.
#define OP(a, o, b, t) v[t] = v[a] o v[b]

// C implementation of the note G program, replicating it as closely as
// possible.
double raw_note_g() {
  double v[25];
  for (int i = 0; i < 25; i++)
    v[i] = 0;

  // Assumed input.
  v[1] = 1;
  v[2] = 2;
  v[3] = 4;
  v[21] = B1;
  v[22] = B3;
  v[23] = B5;

  // The first special instruction can't use the macro.
  v[4] = v[5] = v[6] = v[2] * v[3]; // 1
  
  OP(4, -, 1, 4);         // 2
  OP(5, +, 1, 5);         // 3
  OP(5, /, 4, 11);        // 4
  OP(11, /, 2, 11);       // 5
  OP(13, -, 11, 13);      // 6
  OP(3, -, 1, 10);        // 7
  
  OP(2, +, 7, 7);         // 8
  OP(6, /, 7, 11);        // 9
  OP(21, *, 11, 12);      // 10
  OP(12, +, 13, 13);      // 11
  OP(10, -, 1, 10);       // 12
  
  for (int i = 0; i < 2; i++) {
    {
      OP(6, -, 1, 6);     // 13
      OP(1, +, 7, 7);     // 14
      OP(6, /, 7, 8);     // 15
      OP(8, *, 11, 11);   // 16
    }
    {
      OP(6, -, 1, 6);     // 17
      OP(1, +, 7, 7);     // 18
      OP(6, /, 7, 9);     // 19
      OP(9, *, 11, 11);   // 20
    }
    OP(22, *, 11, 12);    // 21
    OP(12, +, 13, 13);    // 22
    OP(10, -, 1, 10);     // 23
  }
  
  OP(13, +, 24, 24);      // 24
  OP(1, +, 3, 3);

  return v[24];
}

// Implementation of the Note G program where various bug fixes can be turned
// on and off.
double tweaked_note_g(bool division_bug, bool loop_bug, bool sign_bug) {
  double v[25];
  for (int i = 0; i < 25; i++)
    v[i] = 0;

  // Assumed input.
  v[1] = 1;
  v[2] = 2;
  v[3] = 4;
  v[21] = B1;
  v[22] = B3;
  v[23] = B5;

  // The first special instruction can't use the macro.
  v[4] = v[5] = v[6] = v[2] * v[3]; // 1
  
  OP(4, -, 1, 4);         // 2
  OP(5, +, 1, 5);         // 3
  if (division_bug) {
    OP(5, /, 4, 11);      // 4
  } else {
    OP(4, /, 5, 11);      // 4'
  }
  OP(11, /, 2, 11);       // 5
  if (sign_bug) {
    OP(13, -, 11, 13);    // 6
  } else {
    OP(13, +, 11, 13);    // 6'
  }
  OP(3, -, 1, 10);        // 7
  
  OP(2, +, 7, 7);         // 8
  OP(6, /, 7, 11);        // 9
  OP(21, *, 11, 12);      // 10
  if (sign_bug) {
    OP(12, +, 13, 13);    // 11
  } else {
    OP(13, -, 12, 13);    // 11'
  }
  OP(10, -, 1, 10);       // 12
  
  for (int i = 0; i < 2; i++) {
    {
      OP(6, -, 1, 6);     // 13
      OP(1, +, 7, 7);     // 14
      OP(6, /, 7, 8);     // 15
      OP(8, *, 11, 11);   // 16
    }
    {
      OP(6, -, 1, 6);     // 17
      OP(1, +, 7, 7);     // 18
      OP(6, /, 7, 9);     // 19
      OP(9, *, 11, 11);   // 20
    }
    int BP = (i == 0 || loop_bug) ? 22 : 23;
    OP(BP, *, 11, 12);    // 21
    if (sign_bug) {
      OP(12, +, 13, 13);  // 22
    } else {
      OP(13, -, 12, 13);  // 22'
    }
    OP(10, -, 1, 10);     // 23
  }
  
  OP(13, +, 24, 24);      // 24
  OP(1, +, 3, 3);

  return v[24];
}

double c_style() {
  double n = 4;

  double result = 1.0 / 2.0 * (2 * n - 1) / (2 * n + 1);
  double A = 2 * n / 2;
  double term = B1 * A;
  result -= term;
  
  A *= (2 * n - 1) / 3 * (2 * n - 2) / 4;
  term = B3 * A;
  result -= term;

  A *= (2 * n - 3) / 5 * (2 * n - 4) / 6;
  term = B5 * A;
  result -= term;

  return result;
}

double analytical_c_style() {
  double one, two, n, two_n_minus_one, two_n_plus_one, numerator, A,
    current_n, term, factor_1, factor_2;
  double result = 0, denominator = 0;
  
  one = 1.0;
  two = 2.0;
  n = 4.0;
  
  two_n_minus_one = two_n_plus_one = numerator = two * n;
  two_n_minus_one -= one;
  two_n_plus_one += one;
  A = two_n_minus_one / two_n_plus_one;
  A /= two;
  result += A;
  current_n = n - one;
  
  denominator += two;
  A = numerator / denominator;
  term = B1 * A;
  result -= term;
  current_n -= one;
  
  {
    {
      numerator -= one;
      denominator += one;
      factor_1 = numerator / denominator;
      A *= factor_1;
    }
    {
      numerator -= one;
      denominator += one;
      factor_2 = numerator / denominator;
      A *= factor_2;
    }
    term = B3 * A;
    result -= term;
    current_n -= one;
  }
  
  {
    {
      numerator -= one;
      denominator += one;
      factor_1 = numerator / denominator;
      A *= factor_1;
    }
    {
      numerator -= one;
      denominator += one;
      factor_2 = numerator / denominator;
      A *= factor_2;
    }
    term = B5 * A;
    result -= term;
    current_n -= one;
  }
  
  return result;
}

int main() {
  printf("Raw Note G:\t\t%g\n", raw_note_g());
  printf("Note G (all bugs):\t%g\n", tweaked_note_g(true, true, true));
  printf("Note G (division bug):\t%g\n", tweaked_note_g(true, false, false));
  printf("Note G (loop bug):\t%g\n", tweaked_note_g(false, true, false));
  printf("Note G (sign bug):\t%g\n", tweaked_note_g(false, false, true));
  printf("Note G (no bugs):\t%g\n", tweaked_note_g(false, false, false));
  printf("C style:\t\t%g\n", c_style());
  printf("Analytical C style:\t%g\n", analytical_c_style());
}
