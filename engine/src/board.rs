use serde::{Deserialize, Serialize};
use crate::bitboard::Bitboard;
use crate::types::{Color, PieceType, Move};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    // Piece bitboards
    pub white_pawns: Bitboard,
    pub white_knights: Bitboard,
    pub white_bishops: Bitboard,
    pub white_rooks: Bitboard,
    pub white_queens: Bitboard,
    pub white_kings: Bitboard,

    pub black_pawns: Bitboard,
    pub black_knights: Bitboard,
    pub black_bishops: Bitboard,
    pub black_rooks: Bitboard,
    pub black_queens: Bitboard,
    pub black_kings: Bitboard,

    // Aggregate bitboards
    pub white_pieces: Bitboard,
    pub black_pieces: Bitboard,
    pub all_pieces: Bitboard,

    // Game state
    pub turn: Color,
    pub castling_rights: u8,
    pub en_passant_target: Option<u8>,
}

#[derive(Serialize)]
pub struct PieceInfo {
    pub color: Color,
    pub piece_type: PieceType,
    pub square: u8,
}

impl Board {
    pub fn new() -> Self {
        // Initialize an empty board
        Self {
            white_pawns: Bitboard::EMPTY,
            white_knights: Bitboard::EMPTY,
            white_bishops: Bitboard::EMPTY,
            white_rooks: Bitboard::EMPTY,
            white_queens: Bitboard::EMPTY,
            white_kings: Bitboard::EMPTY,
            black_pawns: Bitboard::EMPTY,
            black_knights: Bitboard::EMPTY,
            black_bishops: Bitboard::EMPTY,
            black_rooks: Bitboard::EMPTY,
            black_queens: Bitboard::EMPTY,
            black_kings: Bitboard::EMPTY,
            white_pieces: Bitboard::EMPTY,
            black_pieces: Bitboard::EMPTY,
            all_pieces: Bitboard::EMPTY,
            turn: Color::White,
            castling_rights: 0,
            en_passant_target: None,
        }
    }

    pub fn default() -> Self {
        let mut board = Self::new();
        
        // Initial positions
        // White Pieces (Rank 1 & 2)
        board.white_pawns = Bitboard(0x000000000000FF00);
        board.white_rooks = Bitboard(0x0000000000000081);
        board.white_knights = Bitboard(0x0000000000000042);
        board.white_bishops = Bitboard(0x0000000000000024);
        board.white_queens = Bitboard(0x0000000000000008);
        board.white_kings = Bitboard(0x0000000000000010);

        // Black Pieces (Rank 7 & 8)
        board.black_pawns = Bitboard(0x00FF000000000000);
        board.black_rooks = Bitboard(0x8100000000000000);
        board.black_knights = Bitboard(0x4200000000000000);
        board.black_bishops = Bitboard(0x2400000000000000);
        board.black_queens = Bitboard(0x0800000000000000);
        board.black_kings = Bitboard(0x1000000000000000);

        board.castling_rights = 1 | 2 | 4 | 8; // All rights
        board.en_passant_target = None;

        board.update_occupancy();
        board
    }

    pub fn update_occupancy(&mut self) {
        self.white_pieces = self.white_pawns | self.white_knights | self.white_bishops | 
                            self.white_rooks | self.white_queens | self.white_kings;
        
        self.black_pieces = self.black_pawns | self.black_knights | self.black_bishops | 
                            self.black_rooks | self.black_queens | self.black_kings;
        
        self.all_pieces = self.white_pieces | self.black_pieces;
    }

    pub fn get_piece_at(&self, square: u8) -> Option<(Color, PieceType)> {
        let mask = Bitboard(1u64 << square);

        if (self.all_pieces & mask).is_empty() {
            return None;
        }

        if (self.white_pieces & mask).0 != 0 {
            if (self.white_pawns & mask).0 != 0 { return Some((Color::White, PieceType::Pawn)); }
            if (self.white_knights & mask).0 != 0 { return Some((Color::White, PieceType::Knight)); }
            if (self.white_bishops & mask).0 != 0 { return Some((Color::White, PieceType::Bishop)); }
            if (self.white_rooks & mask).0 != 0 { return Some((Color::White, PieceType::Rook)); }
            if (self.white_queens & mask).0 != 0 { return Some((Color::White, PieceType::Queen)); }
            if (self.white_kings & mask).0 != 0 { return Some((Color::White, PieceType::King)); }
        } else {
            if (self.black_pawns & mask).0 != 0 { return Some((Color::Black, PieceType::Pawn)); }
            if (self.black_knights & mask).0 != 0 { return Some((Color::Black, PieceType::Knight)); }
            if (self.black_bishops & mask).0 != 0 { return Some((Color::Black, PieceType::Bishop)); }
            if (self.black_rooks & mask).0 != 0 { return Some((Color::Black, PieceType::Rook)); }
            if (self.black_queens & mask).0 != 0 { return Some((Color::Black, PieceType::Queen)); }
            if (self.black_kings & mask).0 != 0 { return Some((Color::Black, PieceType::King)); }
        }
        
        None
    }

    pub fn to_piece_list(&self) -> Vec<PieceInfo> {
        let mut pieces = Vec::new();
        for square in 0..64 {
            if let Some((color, piece_type)) = self.get_piece_at(square) {
                pieces.push(PieceInfo {
                    color,
                    piece_type,
                    square,
                });
            }
        }
        pieces
    }

    pub fn get_status(&self) -> crate::types::GameStatus {
        let legal_moves = self.get_legal_moves();
        if legal_moves.is_empty() {
            if self.is_in_check(self.turn) {
                crate::types::GameStatus::Checkmate
            } else {
                crate::types::GameStatus::Stalemate
            }
        } else {
            crate::types::GameStatus::Ongoing
        }
    }

    // --- Move Generation ---

    pub fn get_legal_moves(&self) -> Vec<Move> {
        let mut moves = Vec::new();
        let pseudo_moves = self.generate_pseudo_legal_moves();

        for m in pseudo_moves {
            if self.is_legal_move(&m) {
                moves.push(m);
            }
        }
        moves
    }
    
    // Check if the move is legal (doesn't leave king in check)
    fn is_legal_move(&self, m: &Move) -> bool {
        let mut temp_board = self.clone();
        temp_board.apply_move_unchecked(*m);
        !temp_board.is_in_check(self.turn)
    }

    pub fn is_in_check(&self, color: Color) -> bool {
        let king_bitboard = match color {
            Color::White => self.white_kings,
            Color::Black => self.black_kings,
        };
        
        let king_square = match king_bitboard.lsb() {
            Some(s) => s,
            None => return true, // Should not happen in legal game, but if king is missing, it's "checkmate" logic wise?
        };

        self.is_square_attacked(king_square, color.opposite())
    }

    pub fn get_moves_for_square(&self, square: u8) -> Vec<u8> {
        let mut dests = Vec::new();
        // Generate all legal moves
        let moves = self.get_legal_moves();
        // Filter for the specific square
        for m in moves {
            if m.from == square {
                dests.push(m.to);
            }
        }
        dests
    }

    // Check if 'square' is attacked by 'attacker_color'
    pub fn is_square_attacked(&self, square: u8, attacker_color: Color) -> bool {
        // 1. Pawn attacks
        let pawns = match attacker_color {
            Color::White => self.white_pawns,
            Color::Black => self.black_pawns,
        };
        
        // Attacks from pawns *to* the square.
        // White pawns capture Up-Left (+7) and Up-Right (+9).
        // To see if 'square' is attacked by a White Pawn, we look 'backward' from the square.
        // If square is attacked from Up-Left (+7), the pawn is at square-7 (Down-Right).
        // If square is attacked from Up-Right (+9), the pawn is at square-9 (Down-Left).
        
        if attacker_color == Color::White {
            // Check potential attacker at square - 7 (which moves +7 to hit square)
            // +7 is Up-Left. Valid if source col > 0.
            // dest col = src col - 1.
            // So dest col < 7. Square cannot be File H.
            if square >= 7 && (square % 8 != 7) && pawns.get_bit(square - 7) { return true; } 
            
            // Check potential attacker at square - 9 (which moves +9 to hit square)
            // +9 is Up-Right. Valid if source col < 7.
            // dest col = src col + 1.
            // So dest col > 0. Square cannot be File A.
            if square >= 9 && (square % 8 != 0) && pawns.get_bit(square - 9) { return true; }
        } else {
            // Black pawns capture Down-Right (-7) and Down-Left (-9).
            // We look 'backward' (Up).
            
            // Check attacker at square + 7 (which moves -7 to hit square)
            // -7 is Down-Right. Valid if src col < 7.
            // dest col = src col + 1.
            // So dest col > 0. Square cannot be File A.
            if square <= 56 && (square % 8 != 0) && pawns.get_bit(square + 7) { return true; }
            
            // Check attacker at square + 9 (which moves -9 to hit square)
            // -9 is Down-Left. Valid if src col > 0.
            // dest col = src col - 1.
            // So dest col < 7. Square cannot be File H.
            if square <= 54 && (square % 8 != 7) && pawns.get_bit(square + 9) { return true; }
        }

        // 2. Knight attacks
        let knights = match attacker_color {
            Color::White => self.white_knights,
            Color::Black => self.black_knights,
        };
        if !(self.get_knight_attacks(square) & knights).is_empty() { return true; }

        // 3. King attacks
        let kings = match attacker_color {
            Color::White => self.white_kings,
            Color::Black => self.black_kings,
        };
        if !(self.get_king_attacks(square) & kings).is_empty() { return true; }

        // 4. Sliding pieces (Rook/Queen)
        let rooks = match attacker_color {
            Color::White => self.white_rooks | self.white_queens,
            Color::Black => self.black_rooks | self.black_queens,
        };
        // Simple ray cast for check detection
        // Horizontal/Vertical
        if self.is_attacked_by_slider(square, rooks, true) { return true; }

        // 5. Sliding pieces (Bishop/Queen)
        let bishops = match attacker_color {
            Color::White => self.white_bishops | self.white_queens,
            Color::Black => self.black_bishops | self.black_queens,
        };
        // Diagonal
        if self.is_attacked_by_slider(square, bishops, false) { return true; }

        false
    }
    
    // Helper for sliding attacks
    fn is_attacked_by_slider(&self, square: u8, attackers: Bitboard, orthogonal: bool) -> bool {
        let directions: &[(i8, i8); 4] = if orthogonal {
            &[(1,0), (-1,0), (0,1), (0,-1)]
        } else {
            &[(1,1), (1,-1), (-1,1), (-1,-1)]
        };

        for &(dr, dc) in directions {
            let mut r = (square / 8) as i8 + dr;
            let mut c = (square % 8) as i8 + dc;
            
            while r >= 0 && r < 8 && c >= 0 && c < 8 {
                let s = (r * 8 + c) as u8;
                if attackers.get_bit(s) { return true; }
                if self.all_pieces.get_bit(s) { break; } // Blocked
                r += dr;
                c += dc;
            }
        }
        false
    }

    fn generate_pseudo_legal_moves(&self) -> Vec<Move> {
        let mut moves = Vec::new();
        let (friends, enemies) = if self.turn == Color::White {
            (self.white_pieces, self.black_pieces)
        } else {
            (self.black_pieces, self.white_pieces)
        };

        // 1. Pawns
        let pawns = if self.turn == Color::White { self.white_pawns } else { self.black_pawns };
        let mut p = pawns;
        while let Some(src) = p.pop_lsb() {
             // Push
             let forward = if self.turn == Color::White { 8 } else { -8 };
             let dest = (src as i8 + forward) as u8;
             if dest < 64 && !self.all_pieces.get_bit(dest) {
                 moves.push(Move { from: src, to: dest, promotion: None }); // TODO: Promotion
                 
                 // Double Push
                 let start_rank = if self.turn == Color::White { 1 } else { 6 };
                 if (src / 8) == start_rank {
                     let dest2 = (src as i8 + forward * 2) as u8;
                     if !self.all_pieces.get_bit(dest2) {
                         moves.push(Move { from: src, to: dest2, promotion: None });
                     }
                 }
             }
             
             // Captures
             let capture_offsets = if self.turn == Color::White { &[7, 9] } else { &[-7, -9] };
             for &offset in capture_offsets {
                 let dest = (src as i8 + offset) as u8;
                 // Check bounds and wrapping
                 let src_col = src % 8;
                 let dest_col = dest % 8;
                 if dest < 64 && (src_col as i8 - dest_col as i8).abs() == 1 {
                     if enemies.get_bit(dest) {
                         moves.push(Move { from: src, to: dest, promotion: None });
                     } else if let Some(ep) = self.en_passant_target {
                         if dest == ep {
                             moves.push(Move { from: src, to: dest, promotion: None });
                         }
                     }
                 }
             }
        }

        // 2. Knights
        let knights = if self.turn == Color::White { self.white_knights } else { self.black_knights };
        let mut n = knights;
        while let Some(src) = n.pop_lsb() {
            let attacks = self.get_knight_attacks(src);
            let valid_moves = attacks & !friends; // Can't capture own
            let mut dests = valid_moves;
            while let Some(dest) = dests.pop_lsb() {
                moves.push(Move { from: src, to: dest, promotion: None });
            }
        }
        
        // 3. Kings
        let kings = if self.turn == Color::White { self.white_kings } else { self.black_kings };
        let mut k = kings;
        while let Some(src) = k.pop_lsb() {
            let attacks = self.get_king_attacks(src);
            let valid_moves = attacks & !friends;
            let mut dests = valid_moves;
            while let Some(dest) = dests.pop_lsb() {
                moves.push(Move { from: src, to: dest, promotion: None });
            }

            // Castling
            if self.turn == Color::White {
                // White King Side (Rights: 1)
                if (self.castling_rights & 1) != 0 {
                    // Squares F1(5), G1(6) must be empty
                    if !self.all_pieces.get_bit(5) && !self.all_pieces.get_bit(6) {
                        // Squares E1(4), F1(5), G1(6) must not be attacked
                        if !self.is_square_attacked(4, Color::Black) && 
                           !self.is_square_attacked(5, Color::Black) && 
                           !self.is_square_attacked(6, Color::Black) {
                            moves.push(Move { from: src, to: 6, promotion: None });
                        }
                    }
                }
                // White Queen Side (Rights: 2)
                if (self.castling_rights & 2) != 0 {
                    // Squares B1(1), C1(2), D1(3) must be empty
                    if !self.all_pieces.get_bit(1) && !self.all_pieces.get_bit(2) && !self.all_pieces.get_bit(3) {
                         // Squares E1(4), D1(3), C1(2) must not be attacked
                         if !self.is_square_attacked(4, Color::Black) && 
                            !self.is_square_attacked(3, Color::Black) && 
                            !self.is_square_attacked(2, Color::Black) {
                             moves.push(Move { from: src, to: 2, promotion: None });
                         }
                    }
                }
            } else {
                // Black King Side (Rights: 4)
                if (self.castling_rights & 4) != 0 {
                    // F8(61), G8(62) empty
                    if !self.all_pieces.get_bit(61) && !self.all_pieces.get_bit(62) {
                        // E8(60), F8(61), G8(62) safe
                         if !self.is_square_attacked(60, Color::White) && 
                            !self.is_square_attacked(61, Color::White) && 
                            !self.is_square_attacked(62, Color::White) {
                            moves.push(Move { from: src, to: 62, promotion: None });
                        }
                    }
                }
                 // Black Queen Side (Rights: 8)
                if (self.castling_rights & 8) != 0 {
                    // B8(57), C8(58), D8(59) empty
                    if !self.all_pieces.get_bit(57) && !self.all_pieces.get_bit(58) && !self.all_pieces.get_bit(59) {
                        // E8(60), D8(59), C8(58) safe
                        if !self.is_square_attacked(60, Color::White) && 
                           !self.is_square_attacked(59, Color::White) && 
                           !self.is_square_attacked(58, Color::White) {
                             moves.push(Move { from: src, to: 58, promotion: None });
                         }
                    }
                }
            }
        }

        // 4. Sliders (Rooks, Bishops, Queens)
        // Helper closure
        let mut generate_slider_moves = |pieces: Bitboard, orthogonal: bool, diagonal: bool| {
            let mut p_iter = pieces;
            while let Some(src) = p_iter.pop_lsb() {
                let directions: Vec<(i8, i8)> = {
                    let mut d = Vec::new();
                    if orthogonal { d.extend_from_slice(&[(1,0), (-1,0), (0,1), (0,-1)]); }
                    if diagonal { d.extend_from_slice(&[(1,1), (1,-1), (-1,1), (-1,-1)]); }
                    d
                };
                
                for (dr, dc) in directions {
                    let mut r = (src / 8) as i8 + dr;
                    let mut c = (src % 8) as i8 + dc;
                    while r >= 0 && r < 8 && c >= 0 && c < 8 {
                        let dest = (r * 8 + c) as u8;
                        if friends.get_bit(dest) { break; } // Blocked by friend
                        
                        moves.push(Move { from: src, to: dest, promotion: None });
                        
                        if enemies.get_bit(dest) { break; } // Capture and stop
                        if self.all_pieces.get_bit(dest) { break; } // Blocked by... wait, friends are handled. This must be enemy or empty?
                        // If logic:
                        // if empty -> continue
                        // if friend -> break (before adding) -> done above
                        // if enemy -> add and break -> done above
                        
                        // Wait, my loop above adds then checks.
                        // Correct logic:
                        // 1. Check square content
                        // 2. If friend: break
                        // 3. Add move
                        // 4. If enemy: break
                        // 5. Continue
                        //
                        // Re-evaluating loop order above:
                        // if friends.get_bit(dest) { break; } -> Correct
                        // moves.push(...) -> Correct
                        // if enemies.get_bit(dest) { break; } -> Correct
                        
                        r += dr;
                        c += dc;
                    }
                }
            }
        };

        let rooks = if self.turn == Color::White { self.white_rooks } else { self.black_rooks };
        generate_slider_moves(rooks, true, false);

        let bishops = if self.turn == Color::White { self.white_bishops } else { self.black_bishops };
        generate_slider_moves(bishops, false, true);

        let queens = if self.turn == Color::White { self.white_queens } else { self.black_queens };
        generate_slider_moves(queens, true, true);

        moves
    }

    fn get_knight_attacks(&self, square: u8) -> Bitboard {
        let mut attacks = Bitboard::EMPTY;
        let r = (square / 8) as i8;
        let c = (square % 8) as i8;
        let offsets = [
            (2, 1), (2, -1), (-2, 1), (-2, -1),
            (1, 2), (1, -2), (-1, 2), (-1, -2)
        ];
        for (dr, dc) in offsets {
            let nr = r + dr;
            let nc = c + dc;
            if nr >= 0 && nr < 8 && nc >= 0 && nc < 8 {
                attacks.set_bit((nr * 8 + nc) as u8);
            }
        }
        attacks
    }

    fn get_king_attacks(&self, square: u8) -> Bitboard {
        let mut attacks = Bitboard::EMPTY;
        let r = (square / 8) as i8;
        let c = (square % 8) as i8;
        for dr in -1..=1 {
            for dc in -1..=1 {
                if dr == 0 && dc == 0 { continue; }
                let nr = r + dr;
                let nc = c + dc;
                if nr >= 0 && nr < 8 && nc >= 0 && nc < 8 {
                    attacks.set_bit((nr * 8 + nc) as u8);
                }
            }
        }
        attacks
    }

    // A helper to apply a move (checking legality first)
    pub fn apply_move(&mut self, m: Move) -> Result<(), String> {
        // Validate against legal moves
        let legal_moves = self.get_legal_moves();
        if !legal_moves.contains(&m) {
            return Err("Illegal move".to_string());
        }
        self.apply_move_unchecked(m);
        Ok(())
    }

    fn apply_move_unchecked(&mut self, m: Move) {
        let (color, piece_type) = self.get_piece_at(m.from).expect("Piece not found");
        
        let is_en_passant = piece_type == PieceType::Pawn && 
                            (m.from as i8 - m.to as i8).abs() % 8 != 0 && 
                            !self.all_pieces.get_bit(m.to);
                            
        let is_castling = piece_type == PieceType::King && (m.from as i8 - m.to as i8).abs() == 2;

        self.clear_square(m.from, color, piece_type);
        
        // Capture
        if is_en_passant {
             let capture_sq = if color == Color::White { m.to - 8 } else { m.to + 8 };
             self.clear_square(capture_sq, color.opposite(), PieceType::Pawn);
        } else if let Some((dest_color, dest_type)) = self.get_piece_at(m.to) {
             self.clear_square(m.to, dest_color, dest_type);
             // Rook Capture Rights Update
             match m.to {
                 0 => self.castling_rights &= !2, // WQ
                 7 => self.castling_rights &= !1, // WK
                 56 => self.castling_rights &= !8, // BQ
                 63 => self.castling_rights &= !4, // BK
                 _ => {}
             }
        }
        
        // Place
        let final_piece = m.promotion.unwrap_or(piece_type);
        self.set_square(m.to, color, final_piece);
        
        // Castling Rook Move
        if is_castling {
            match m.to {
                6 => { // White Short (G1)
                     self.clear_square(7, Color::White, PieceType::Rook);
                     self.set_square(5, Color::White, PieceType::Rook);
                },
                2 => { // White Long (C1)
                     self.clear_square(0, Color::White, PieceType::Rook);
                     self.set_square(3, Color::White, PieceType::Rook);
                },
                62 => { // Black Short (G8)
                     self.clear_square(63, Color::Black, PieceType::Rook);
                     self.set_square(61, Color::Black, PieceType::Rook);
                },
                58 => { // Black Long (C8)
                     self.clear_square(56, Color::Black, PieceType::Rook);
                     self.set_square(59, Color::Black, PieceType::Rook);
                },
                _ => {}
            }
        }
        
        // Update Rights (Moving)
        if piece_type == PieceType::King {
             if color == Color::White { self.castling_rights &= !3; }
             else { self.castling_rights &= !12; }
        } else if piece_type == PieceType::Rook {
             match m.from {
                 0 => self.castling_rights &= !2,
                 7 => self.castling_rights &= !1,
                 56 => self.castling_rights &= !8,
                 63 => self.castling_rights &= !4,
                 _ => {}
             }
        }
        
        // Update En Passant
        self.en_passant_target = None;
        if piece_type == PieceType::Pawn && (m.from as i8 - m.to as i8).abs() == 16 {
             self.en_passant_target = Some((m.from + m.to) / 2);
        }
        
        self.update_occupancy();
        self.turn = self.turn.opposite();
    }
    
    // Kept for internal use
    fn clear_square(&mut self, square: u8, color: Color, piece_type: PieceType) {
         let mut mask = Bitboard(1u64 << square);
         mask = !mask; 
         
         match (color, piece_type) {
             (Color::White, PieceType::Pawn) => self.white_pawns &= mask,
             (Color::White, PieceType::Knight) => self.white_knights &= mask,
             (Color::White, PieceType::Bishop) => self.white_bishops &= mask,
             (Color::White, PieceType::Rook) => self.white_rooks &= mask,
             (Color::White, PieceType::Queen) => self.white_queens &= mask,
             (Color::White, PieceType::King) => self.white_kings &= mask,
             (Color::Black, PieceType::Pawn) => self.black_pawns &= mask,
             (Color::Black, PieceType::Knight) => self.black_knights &= mask,
             (Color::Black, PieceType::Bishop) => self.black_bishops &= mask,
             (Color::Black, PieceType::Rook) => self.black_rooks &= mask,
             (Color::Black, PieceType::Queen) => self.black_queens &= mask,
             (Color::Black, PieceType::King) => self.black_kings &= mask,
         }
    }

    fn set_square(&mut self, square: u8, color: Color, piece_type: PieceType) {
         let mask = Bitboard(1u64 << square);
         
         match (color, piece_type) {
             (Color::White, PieceType::Pawn) => self.white_pawns |= mask,
             (Color::White, PieceType::Knight) => self.white_knights |= mask,
             (Color::White, PieceType::Bishop) => self.white_bishops |= mask,
             (Color::White, PieceType::Rook) => self.white_rooks |= mask,
             (Color::White, PieceType::Queen) => self.white_queens |= mask,
             (Color::White, PieceType::King) => self.white_kings |= mask,
             (Color::Black, PieceType::Pawn) => self.black_pawns |= mask,
             (Color::Black, PieceType::Knight) => self.black_knights |= mask,
             (Color::Black, PieceType::Bishop) => self.black_bishops |= mask,
             (Color::Black, PieceType::Rook) => self.black_rooks |= mask,
             (Color::Black, PieceType::Queen) => self.black_queens |= mask,
             (Color::Black, PieceType::King) => self.black_kings |= mask,
         }
    }
}
