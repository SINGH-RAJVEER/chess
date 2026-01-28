use serde::Serialize;
use std::ops::{BitAnd, BitOr, BitXor, Not, Shl, Shr, BitAndAssign, BitOrAssign, BitXorAssign};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
pub struct Bitboard(pub u64);

impl Bitboard {
    pub const EMPTY: Self = Bitboard(0);
    pub const UNIVERSE: Self = Bitboard(!0);
    
    pub const FILE_A: Self = Bitboard(0x0101010101010101);
    pub const FILE_B: Self = Bitboard(0x0202020202020202);
    pub const FILE_G: Self = Bitboard(0x4040404040404040);
    pub const FILE_H: Self = Bitboard(0x8080808080808080);

    pub const RANK_1: Self = Bitboard(0x00000000000000FF);
    pub const RANK_2: Self = Bitboard(0x000000000000FF00);
    pub const RANK_7: Self = Bitboard(0x00FF000000000000);
    pub const RANK_8: Self = Bitboard(0xFF00000000000000);

    pub fn new(val: u64) -> Self {
        Bitboard(val)
    }

    pub fn set_bit(&mut self, square: u8) {
        self.0 |= 1u64 << square;
    }

    pub fn clear_bit(&mut self, square: u8) {
        self.0 &= !(1u64 << square);
    }

    pub fn get_bit(&self, square: u8) -> bool {
        (self.0 & (1u64 << square)) != 0
    }

    pub fn count_ones(&self) -> u32 {
        self.0.count_ones()
    }
    
    pub fn is_empty(&self) -> bool {
        self.0 == 0
    }

    pub fn lsb(&self) -> Option<u8> {
        if self.0 == 0 {
            None
        } else {
            Some(self.0.trailing_zeros() as u8)
        }
    }

    pub fn pop_lsb(&mut self) -> Option<u8> {
        let lsb = self.lsb()?;
        self.0 &= self.0 - 1; 
        Some(lsb)
    }
}

// Bitwise operators for Bitboard
impl BitAnd for Bitboard {
    type Output = Self;
    fn bitand(self, rhs: Self) -> Self { Bitboard(self.0 & rhs.0) }
}

impl BitOr for Bitboard {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self { Bitboard(self.0 | rhs.0) }
}

impl BitXor for Bitboard {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self { Bitboard(self.0 ^ rhs.0) }
}

impl Not for Bitboard {
    type Output = Self;
    fn not(self) -> Self { Bitboard(!self.0) }
}

impl Shl<u8> for Bitboard {
    type Output = Self;
    fn shl(self, rhs: u8) -> Self { Bitboard(self.0 << rhs) }
}

impl Shr<u8> for Bitboard {
    type Output = Self;
    fn shr(self, rhs: u8) -> Self { Bitboard(self.0 >> rhs) }
}

impl BitAndAssign for Bitboard {
    fn bitand_assign(&mut self, rhs: Self) { self.0 &= rhs.0; }
}

impl BitOrAssign for Bitboard {
    fn bitor_assign(&mut self, rhs: Self) { self.0 |= rhs.0; }
}

impl BitXorAssign for Bitboard {
    fn bitxor_assign(&mut self, rhs: Self) { self.0 ^= rhs.0; }
}

impl fmt::Display for Bitboard {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "")?;
        for rank in (0..8).rev() {
            for file in 0..8 {
                let square = rank * 8 + file;
                let char = if self.get_bit(square) { '1' } else { '.' };
                write!(f, "{} ", char)?;
            }
            writeln!(f, "")?;
        }
        Ok(())
    }
}
