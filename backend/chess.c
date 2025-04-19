#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

//instead of creating this 2d array of structs its best to create a version of the board for each type of piece in a 64bit long integer where each bit represents the presence of a piece 
//where the integer of each piece is AND operated with the board integer to determine its presence or shift in position


struct Piece {   
    int captured;
    int colour;
    int id;
};

struct Piece king;
struct Piece queen;
struct Piece rook;
struct Piece bishop;
struct Piece knight;
struct Piece pawn;

struct Piece chess_board[8][8];

void init_chess_board() {
    // Clear board
    for (int i = 0; i < 8; i++)
    {
        for (int j = 0; j < 8; j++)
        {
            chess_board[i][j] = (struct Piece){0}; // Initialize with zero values instead of NULL
        }
    }
    // Place black pieces
    struct Piece black_rook1 = {0, 1, 0};
    struct Piece black_rook2 = {0, 2, 0};
    struct Piece black_knight1 = {0, 1, 0};
    struct Piece black_knight2 = {0, 2, 0};
    struct Piece black_bishop1 = {0, 1, 0};
    struct Piece black_bishop2 = {0, 2, 0};
    struct Piece black_queen = {0, 1, 0};
    struct Piece black_king = {0, 1, 0};
    
    chess_board[0][0] = black_rook1;
    chess_board[0][7] = black_rook2;
    chess_board[0][1] = black_knight1;
    chess_board[0][6] = black_knight2;
    chess_board[0][2] = black_bishop1;
    chess_board[0][5] = black_bishop2;
    chess_board[0][3] = black_queen;
    chess_board[0][4] = black_king;
    
    // Place black pawns
    for (int j = 0; j < 8; j++)
    {
        struct Piece black_pawn = {0, j+1};
        chess_board[1][j] = black_pawn;
    }
    
    // Place white pieces
    struct Piece white_rook1 = {1, 1, 0};
    struct Piece white_rook2 = {1, 2, 0};
    struct Piece white_knight1 = {1, 1, 0};
    struct Piece white_knight2 = {1, 2, 0};
    struct Piece white_bishop1 = {1, 1, 0};
    struct Piece white_bishop2 = {1, 2, 0};
    struct Piece white_queen = {1, 1, 0};
    struct Piece white_king = {1, 1, 0};
    
    chess_board[7][0] = white_rook1;
    chess_board[7][7] = white_rook2;
    chess_board[7][1] = white_knight1;
    chess_board[7][6] = white_knight2;
    chess_board[7][2] = white_bishop1;
    chess_board[7][5] = white_bishop2;
    chess_board[7][3] = white_queen;
    chess_board[7][4] = white_king;
    
    // Place white pawns
    for (int j = 0; j < 8; j++)
    {
        struct Piece white_pawn = {1, j+1};
        chess_board[6][j] = white_pawn;
    }
}

// Parse a move in algebraic notation (e.g., "e2e4") into source and destination coordinates.
int parse_chess_board_move(const char *move, int *srcRow, int *srcCol, int *destRow, int *destCol)
{
    if (strlen(move) != 4) return 0;
    
    *srcCol = move[0] - 'a';
    *srcRow = 8 - (move[1] - '0');
    *destCol = move[2] - 'a';
    *destRow = 8 - (move[3] - '0');
 
    return srcRow >= 0 && srcRow < 8 && srcCol >= 0 && srcCol < 8 && destRow >= 0 && destRow < 8 && destCol >= 0 && destCol < 8;
}

int move_chess_piece(int srcRow, int srcCol, int destRow, int destCol) {
    //have to implement legality checks
    chess_board[destRow][destCol] = chess_board[srcRow][srcCol];
    chess_board[srcRow][srcCol] = (struct Piece){0};
    return 1;
}




















#define BOARD_SIZE 8
// Board representation: each cell holds a character indicating the piece.
// Uppercase letters represent white pieces and lowercase letters represent black pieces.
// 'P'/'p': Pawn, 'R'/'r': Rook, 'N'/'n': Knight, 'B'/'b': Bishop, 'Q'/'q': Queen, 'K'/'k': King, '.' for empty
char board[BOARD_SIZE][BOARD_SIZE];

// Function prototypes
void init_board();
void print_board();
int parse_move(const char *move, int *srcRow, int *srcCol, int *destRow, int *destCol);
int is_valid_coordinate(int row, int col);
int move_piece(int srcRow, int srcCol, int destRow, int destCol);
int is_valid_move(int srcRow, int srcCol, int destRow, int destCol);

int main()
{
    char move[10];
    int srcRow, srcCol, destRow, destCol;
    int turn = 1; // 1 for White, -1 for Black

    init_board();
    printf("Enter moves in the format: e2e4\n\n");

    while (1)
    {
        print_board();
        printf("%s's move (or 'quit' to exit): ", (turn == 1) ? "White" : "Black");
        if (scanf("%9s", move) != 1)
            break;
        if (strcmp(move, "quit") == 0)
            break;

        if (!parse_move(move, &srcRow, &srcCol, &destRow, &destCol))
        {
            printf("Invalid move format. Try again.\n");
            continue;
        }

        // Check if source cell has a piece belonging to the current player
        char piece = board[srcRow][srcCol];
        if (piece == '.')
        {
            printf("No piece at source location. Try again.\n");
            continue;
        }
        // Simple turn validation: white pieces are uppercase, black are lowercase.
        if ((turn == 1 && !isupper(piece)) || (turn == -1 && !islower(piece)))
        {
            printf("That's not your piece. Try again.\n");
            continue;
        }

        // Check move validity (this function can be expanded with detailed chess rules)
        if (!is_valid_move(srcRow, srcCol, destRow, destCol))
        {
            printf("Invalid move. Try again.\n");
            continue;
        }

        // Execute move
        if (move_piece(srcRow, srcCol, destRow, destCol))
        {
            // Switch turns
            turn = -turn;
        }
        else
        {
            printf("Move could not be completed. Try again.\n");
        }
    }

    printf("Game over.\n");
    return 0;
}

// Initialize the chess board with standard starting positions.
void init_board()
{
    // Clear board
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            board[i][j] = '.';
        }
    }
    // Place black pieces
    board[0][0] = board[0][7] = 'r';
    board[0][1] = board[0][6] = 'n';
    board[0][2] = board[0][5] = 'b';
    board[0][3] = 'q';
    board[0][4] = 'k';
    for (int j = 0; j < BOARD_SIZE; j++)
    {
        board[1][j] = 'p';
    }
    // Place white pieces
    board[7][0] = board[7][7] = 'R';
    board[7][1] = board[7][6] = 'N';
    board[7][2] = board[7][5] = 'B';
    board[7][3] = 'Q';
    board[7][4] = 'K';
    for (int j = 0; j < BOARD_SIZE; j++)
    {
        board[6][j] = 'P';
    }
}

// Print the board to the console.
void print_board()
{
    printf("\n  a b c d e f g h\n");
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        printf("%d ", 8 - i);
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            printf("%c ", board[i][j]);
        }
        printf("%d\n", 8 - i);
    }
    printf("  a b c d e f g h\n\n");
}

// Parse a move in algebraic notation (e.g., "e2e4") into source and destination coordinates.
int parse_move(const char *move, int *srcRow, int *srcCol, int *destRow, int *destCol)
{
    if (strlen(move) != 4) return 0;
    // Columns: a-h => 0-7, Rows: 1-8 => 7-0 (since board[0][*] is the 8th rank)
    *srcCol = move[0] - 'a';
    *srcRow = 8 - (move[1] - '0');
    *destCol = move[2] - 'a';
    *destRow = 8 - (move[3] - '0');

    return is_valid_coordinate(*srcRow, *srcCol) && is_valid_coordinate(*destRow, *destCol);
}

// Check if a coordinate is within the board limits.
int is_valid_coordinate(int row, int col)
{
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// Move the piece from the source to destination.
int move_piece(int srcRow, int srcCol, int destRow, int destCol)
{
    // For simplicity, we allow capturing any opponent piece.
    // In a complete implementation, further move legality checks would be done.
    board[destRow][destCol] = board[srcRow][srcCol];
    board[srcRow][srcCol] = '.';
    return 1;
}

// Basic move validation: this function can be extended for full chess rules.
int is_valid_move(int srcRow, int srcCol, int destRow, int destCol)
{
    char piece = board[srcRow][srcCol];
    char target = board[destRow][destCol];

    // Do not allow capturing your own piece.
    if (piece != '.' && target != '.')
    {
        if ((isupper(piece) && isupper(target)) || (islower(piece) && islower(target)))
        {
            return 0;
        }
    }

    // As an example, we can add simple pawn move validation.
    if (piece == 'P' || piece == 'p')
    {
        int direction = (piece == 'P') ? -1 : 1; // White pawns move up (decreasing row), black pawns move down
        // Normal one square forward
        if (destCol == srcCol && destRow == srcRow + direction && target == '.')
        {
            return 1;
        }
        // Two squares forward from starting position
        if (destCol == srcCol && target == '.')
        {
            if ((piece == 'P' && srcRow == 6 && destRow == 4) || (piece == 'p' && srcRow == 1 && destRow == 3))
            {
                // Note: this doesn't check that the intermediate square is free.
                return 1;
            }
        }
        // Capture: one square diagonally
        if ((destCol == srcCol + 1 || destCol == srcCol - 1) && destRow == srcRow + direction && target != '.')
        {
            return 1;
        }
        return 0;
    }

    // For other pieces, we skip detailed movement validation for now.
    // A complete implementation would include specific rules for Rook, Knight, Bishop, Queen, and King.
    return 1;
}
