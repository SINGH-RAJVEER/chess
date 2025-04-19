interface Piece {
    isWhite: boolean;  
    id: number;       
}

interface Pawn extends Piece {
    type: 'pawn';
}

interface Rook extends Piece {
    type: 'rook';
}

interface Knight extends Piece {
    type: 'knight'; 
}

interface Bishop extends Piece {
    type: 'bishop';
}

interface Queen extends Piece {
    type: 'queen';
}

interface King extends Piece {
    type: 'king';
}

type ChessPiece = Pawn | Rook | Knight | Bishop | Queen | King;



function initBoard(): (ChessPiece | null)[][] {
    const board: (ChessPiece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null)); //Initialises the board with null values

    // Place black pieces
    board[0][0] = { type: 'rook', isWhite: false, id: 1 };
    board[0][1] = { type: 'knight', isWhite: false, id: 1 };
    board[0][2] = { type: 'bishop', isWhite: false, id: 1 };
    board[0][3] = { type: 'queen', isWhite: false, id: 1 };
    board[0][4] = { type: 'king', isWhite: false, id: 1 };
    board[0][5] = { type: 'bishop', isWhite: false, id: 2 };
    board[0][6] = { type: 'knight', isWhite: false, id: 2 };
    board[0][7] = { type: 'rook', isWhite: false, id: 2 };

    // Place black pawns
    for (let i = 0; i < 8; i++) {
        board[1][i] = { type: 'pawn', isWhite: false, id: i+1 };
    }

    // Place white pawns
    for (let i = 0; i < 8; i++) {
        board[6][i] = { type: 'pawn', isWhite: true, id: i+1 };
    }

    // Place white pieces
    board[7][0] = { type: 'rook', isWhite: true, id: 1 };
    board[7][1] = { type: 'knight', isWhite: true, id: 1 };
    board[7][2] = { type: 'bishop', isWhite: true, id: 1 };
    board[7][3] = { type: 'queen', isWhite: true, id: 1 };
    board[7][4] = { type: 'king', isWhite: true, id: 1 };
    board[7][5] = { type: 'bishop', isWhite: true, id: 2 };
    board[7][6] = { type: 'knight', isWhite: true, id: 2 };
    board[7][7] = { type: 'rook', isWhite: true, id: 2 };

    return board;
}

function parseMove(move: string, srcCol:number, srcRow:number, destRow:number, destCol:number):boolean {
    if (move.length !== 4) {
        console.error("Invalid move");
        return false ;
    }
    
    srcCol = move.charCodeAt(0) - 'a'.charCodeAt(0);
    srcRow = 8 - (parseInt(move[1]));
    destCol = move.charCodeAt(2) - 'a'.charCodeAt(0);
    destRow = 8 - (parseInt(move[3]));
    
    return srcRow >= 0 && srcRow < 8 && srcCol >= 0 && srcCol < 8 && destRow >= 0 && destRow < 8 && destCol >= 0 && destCol < 8;
}

const ChessBoard = initBoard();

function movePiece(srcCol:number, srcRow:number, destCol:number, destRow:number):void{
    //no legality checks added to the logic yet
    ChessBoard[destRow][destCol] = ChessBoard[srcRow][srcCol];
    ChessBoard[srcRow][srcCol] = null;
}
