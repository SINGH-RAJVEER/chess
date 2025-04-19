#include <iostream>

using namespace std;

class King
{
    bool colour;

public:
    int x, y;
    King(bool isWhite = true)
    {
        this->colour = isWhite;
        if (isWhite)
        {
            this->x = 1;
            this->y = 5;
        }
        else
        {
            this->x = 8;
            this->y = 5;
        }
    } 
};

class Queen
{
    bool colour;

public:
    int x, y;
    Queen(bool isWhite = true)
    {
        this->colour = isWhite;
        if (isWhite)
        {
            this->x = 1;
            this->y = 4;
        }
        else
        {
            this->x = 8;
            this->y = 4;
        }
    }
};

class Rook
{
    bool colour;
    int id;

public:
    int x, y;
    Rook(bool isWhite = true, int id = 1)
    {
        this->colour = isWhite;
        this->id = id;
        if (isWhite)
        {
            if (id == 1)
            {
                this->x = 1;
                this->y = 1;
            }
            else
            {
                this->x = 1;
                this->y = 8;
            }
        }
        else
        {
            if (id == 1)
            {
                this->x = 8;
                this->y = 1;
            }
            else
            {
                this->x = 8;
                this->y = 8;
            }
        }
    }
};

class Bishop
{
    bool colour;
    int id;

public:
    int x, y;
    Bishop(bool isWhite = true, int id = 1)
    {
        if(isWhite){
            if(id == 1){
                this->x=1;
                this->y=3;
            }else{
                this->x=1;
                this->y=6; 
            }
        }else{
            if(id == 1){
                this->x=8;
                this->y=3;
            }else{
                this->x=8;
                this->y=6; 
            }
        }
    }
};

class Knight
{
    bool colour;
    int id;

public:
    int x, y;
    Knight(bool isWhite = true, int id = 1)
    {
        if(isWhite){
            if(id == 1){
                this->x=1;
                this->y=2;
            }else{
                this->x=1;
                this->y=7; 
            }
        }else{
            if(id == 1){
                this->x=8;
                this->y=2;
            }else{
                this->x=8;
                this->y=7; 
            }
        }
    }
};

class Pawn
{
    bool colour;
    int id;

public:
    int x, y;
    Pawn(bool isWhite = true, int id = 1){
        if(isWhite){
            switch(id){
                case 1:
                    this->x=2;
                    this->y=1;
                    break;
                case 2:
                    this->x=2;
                    this->y=2;
                    break;
                case 3:
                    this->x=2;
                    this->y=3;
                    break;
                case 4:
                    this->x=2;
                    this->y=4;
                    break;
                case 5:
                    this->x=2;
                    this->y=5;
                    break;
                case 6: 
                    this->x=2;
                    this->y=6;
                    break;
                case 7:
                    this->x=2;
                    this->y=7;
                    break;
                case 8:
                    this->x=2;
                    this->y=8;
                    break;
            }
        }else{
            switch(id){
                case 1:
                    this->x=7;
                    this->y=1;
                    break;
                case 2:
                    this->x=7;
                    this->y=2;
                    break;
                case 3:
                    this->x=7;
                    this->y=3;
                    break;
                case 4:
                    this->x=7;
                    this->y=4;
                    break;
                case 5:
                    this->x=7;
                    this->y=5;
                    break;
                case 6:
                    this->x=7;
                    this->y=6; 
                    break;
                case 7:
                    this->x=7;
                    this->y=7;
                    break;
                case 8:
                    this->x=7;
                    this->y=8;
                    break;
            }
        }
    }
};

class Pieces : King, Queen, Rook, Bishop, Knight, Pawn
{
private:
    bool colour;
    int id;
    int x, y;

public:
    Pieces(bool isWhite, int id, int type)
    {
        switch(type)
        {
            case 1: // King
            {
                King king(isWhite);
                *this = *(Pieces *)&king;
                break;
            }
            case 2: // Queen 
            {
                Queen queen(isWhite);
                *this = *(Pieces *)&queen;
                break;
            }
            case 3: // Rook
            {
                Rook rook(isWhite, id);
                *this = *(Pieces *)&rook;
                break;
            }
            case 4: // Bishop
            {
                Bishop bishop(isWhite, id);
                *this = *(Pieces *)&bishop;
                break;
            }
            case 5: // Knight
            {
                Knight knight(isWhite, id);
                *this = *(Pieces *)&knight;
                break;
            }
            case 6: // Pawn
            {
                Pawn pawn(isWhite, id);
                *this = *(Pieces *)&pawn;
                break;
            }
            default:
                throw invalid_argument("Invalid piece type");
        }
    }
};

int main() {
    cout << "Hello, Chess Backend!" << endl;
    return 0;
}
